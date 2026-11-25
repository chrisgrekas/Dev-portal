// Customers & Environments.
// Ο πελάτης είναι το κεντρικό σημείο του portal:
//   GET /customers/:customerNumber          → workflows, rules, rulesets (μέσω workflows)
//   GET /customers/:customerNumber/history  → μόνο οι αλλαγές που αφορούν τον πελάτη
import { BadRequestException, Body, ConflictException, Controller, Get, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, Max, Min, ValidateIf } from 'class-validator';
import { and, desc, eq, exists, ilike, inArray, or, sql, SQL } from 'drizzle-orm';
import { InjectDb } from '../db/db.module';
import type { DB } from '../db/client';
import {
  changeLog, CUSTOMER_NUMBER_RE, customers, environments, ruleCustomers, ruleEnvironments, rules, rulesets, rulesetSteps,
  ruleVersions, workflowCustomers, workflows, workflowSteps,
} from '../db/schema';
import { ListQuery, offset } from '../common/pagination';
import { ChangeLogService } from '../common/changelog.service';
import { authorOf, CurrentUser, Principal, Roles } from '../auth/auth.decorators';

const NUMBER_MESSAGE = 'customerNumber must be exactly 7 digits';
const GIT_MESSAGE = 'gitUrl must be a valid http(s) URL';
const GIT_URL_OPTIONS = { require_protocol: true, protocols: ['http', 'https'], require_tld: false };

class CreateCustomerDto {
  @ApiProperty({ example: '3131411', description: 'Ακριβώς 7 ψηφία' })
  @IsString() @Matches(CUSTOMER_NUMBER_RE, { message: NUMBER_MESSAGE }) customerNumber: string;
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional({ example: 'https://git.example.com/dat/atlantiki' })
  @IsOptional() @ValidateIf((o) => o.gitUrl !== '') @IsUrl(GIT_URL_OPTIONS, { message: GIT_MESSAGE }) gitUrl?: string;
}
class UpdateCustomerDto {
  @ApiPropertyOptional({ description: 'Νέος αριθμός (ακριβώς 7 ψηφία)' })
  @IsOptional() @IsString() @Matches(CUSTOMER_NUMBER_RE, { message: NUMBER_MESSAGE }) customerNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @ApiPropertyOptional({ nullable: true, description: 'Κενό ή null → αφαιρείται' })
  @IsOptional() @ValidateIf((o) => o.gitUrl !== '') @IsUrl(GIT_URL_OPTIONS, { message: GIT_MESSAGE }) gitUrl?: string | null;
  @ApiProperty() @IsString() @IsNotEmpty() reason: string;
}
class HistoryQuery {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @ApiPropertyOptional({ default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 50;
  @ApiPropertyOptional({ description: 'Μόνο ό,τι αφορά αυτό το περιβάλλον' })
  @IsOptional() @Type(() => Number) @IsInt() environmentId?: number;
}
class CreateEnvironmentDto {
  @ApiProperty({ example: 'test' }) @IsString() @IsNotEmpty() name: string;
}

@ApiTags('customers') @ApiBearerAuth() @ApiSecurity('api-key')
@Controller('customers')
export class CustomersController {
  constructor(@InjectDb() private db: DB, private changes: ChangeLogService) {}

  @Get()
  async list(@Query() q: ListQuery) {
    // Αριθμοί: ταίριασμα από την αρχή (prefix). Όνομα: οπουδήποτε.
    const where = q.search
      ? or(ilike(customers.customerNumber, `${q.search}%`), ilike(customers.name, `%${q.search}%`))
      : undefined;
    const items = await this.db.select().from(customers).where(where)
      .orderBy(customers.customerNumber).limit(q.pageSize).offset(offset(q));
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(customers).where(where);
    return { items, total: count, page: q.page, pageSize: q.pageSize };
  }

  private async findByNumber(customerNumber: string) {
    if (!CUSTOMER_NUMBER_RE.test(customerNumber)) throw new BadRequestException(NUMBER_MESSAGE);
    const [customer] = await this.db.select().from(customers).where(eq(customers.customerNumber, customerNumber));
    if (!customer) throw new NotFoundException(`Customer ${customerNumber} not found`);
    return customer;
  }

  /** Τα workflows, rules και rulesets ενός πελάτη (προαιρετικά μόνο ενός περιβάλλοντος). */
  private async children(cid: number, environmentId?: number) {
    const wfs = await this.db
      .select({
        id: workflows.id, name: workflows.name, description: workflows.description, trigger: workflows.trigger,
        environmentId: workflows.environmentId, updatedAt: workflows.updatedAt,
      })
      .from(workflows)
      .innerJoin(workflowCustomers, and(eq(workflowCustomers.workflowId, workflows.id), eq(workflowCustomers.customerId, cid)))
      .where(environmentId ? eq(workflows.environmentId, environmentId) : undefined)
      .orderBy(workflows.name);

    const ruleRows = await this.db
      .select({
        id: rules.id, name: rules.name, description: rules.description, myclaimId: rules.myclaimId,
        source: rules.source, updatedAt: rules.updatedAt,
        currentVersion: sql<number>`(select max(${ruleVersions.version}) from ${ruleVersions} where ${ruleVersions.ruleId} = ${rules.id})`,
        environmentIds: sql<number[]>`coalesce((select array_agg(${ruleEnvironments.environmentId} order by ${ruleEnvironments.environmentId}) from ${ruleEnvironments} where ${ruleEnvironments.ruleId} = ${rules.id}), '{}')`,
      })
      .from(rules)
      .innerJoin(ruleCustomers, and(eq(ruleCustomers.ruleId, rules.id), eq(ruleCustomers.customerId, cid)))
      .where(
        environmentId
          ? exists(this.db.select().from(ruleEnvironments).where(and(eq(ruleEnvironments.ruleId, rules.id), eq(ruleEnvironments.environmentId, environmentId))))
          : undefined,
      )
      .orderBy(rules.name);

    // Rulesets: όσα τρέχουν σε βήματα των workflows του πελάτη.
    const wfIds = wfs.map((w) => w.id);
    const rsRows = wfIds.length
      ? await this.db
        .select({
          id: rulesets.id, name: rulesets.name, description: rulesets.description, updatedAt: rulesets.updatedAt,
          stepId: workflowSteps.id, stepName: workflowSteps.name, workflowId: workflows.id, workflowName: workflows.name,
        })
        .from(rulesetSteps)
        .innerJoin(rulesets, eq(rulesets.id, rulesetSteps.rulesetId))
        .innerJoin(workflowSteps, eq(workflowSteps.id, rulesetSteps.stepId))
        .innerJoin(workflows, eq(workflows.id, workflowSteps.workflowId))
        .where(inArray(workflows.id, wfIds))
        .orderBy(rulesets.name, workflows.name, workflowSteps.order)
      : [];

    const byRuleset = new Map<number, {
      id: number; name: string; description: string | null; updatedAt: Date;
      usedIn: { workflow: { id: number; name: string }; step: { id: number; name: string } }[];
    }>();
    for (const r of rsRows) {
      const rs = byRuleset.get(r.id) ?? { id: r.id, name: r.name, description: r.description, updatedAt: r.updatedAt, usedIn: [] };
      rs.usedIn.push({ workflow: { id: r.workflowId, name: r.workflowName }, step: { id: r.stepId, name: r.stepName } });
      byRuleset.set(r.id, rs);
    }
    return { workflows: wfs, rules: ruleRows, rulesets: [...byRuleset.values()] };
  }

  @Get(':customerNumber')
  @ApiOperation({ summary: 'Ο πελάτης με τα workflows, rules και rulesets (μέσω workflows) του' })
  async overview(@Param('customerNumber') customerNumber: string) {
    const customer = await this.findByNumber(customerNumber);
    return { ...customer, ...(await this.children(customer.id)) };
  }

  @Get(':customerNumber/history')
  @ApiOperation({ summary: 'Ιστορικό αλλαγών μόνο για τον πελάτη, τα workflows/rules του και τα rulesets των workflows του' })
  async history(@Param('customerNumber') customerNumber: string, @Query() q: HistoryQuery) {
    const customer = await this.findByNumber(customerNumber);
    const c = await this.children(customer.id, q.environmentId);

    const names = new Map<string, string>([[`Customer:${customer.id}`, customer.name]]);
    c.workflows.forEach((w) => names.set(`Workflow:${w.id}`, w.name));
    c.rules.forEach((r) => names.set(`Rule:${r.id}`, r.name));
    c.rulesets.forEach((r) => names.set(`Ruleset:${r.id}`, r.name));

    const scope = (type: string, ids: number[]): SQL | undefined =>
      ids.length ? and(eq(changeLog.entityType, type), inArray(changeLog.entityId, ids)) : undefined;
    const where = or(
      and(eq(changeLog.entityType, 'Customer'), eq(changeLog.entityId, customer.id)),
      scope('Workflow', c.workflows.map((w) => w.id)),
      scope('Rule', c.rules.map((r) => r.id)),
      scope('Ruleset', c.rulesets.map((r) => r.id)),
    );

    const rows = await this.db.select().from(changeLog).where(where)
      .orderBy(desc(changeLog.createdAt), desc(changeLog.id))
      .limit(q.pageSize).offset((q.page - 1) * q.pageSize);
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(changeLog).where(where);
    return {
      items: rows.map((e) => ({ ...e, entityName: names.get(`${e.entityType}:${e.entityId}`) ?? null })),
      total: count, page: q.page, pageSize: q.pageSize,
    };
  }

  @Roles('admin', 'editor') @Patch(':customerNumber') @ApiOperation({ summary: 'Όνομα / αριθμός / Git URL πελάτη' })
  async update(@Param('customerNumber') customerNumber: string, @Body() dto: UpdateCustomerDto, @CurrentUser() p: Principal) {
    const current = await this.findByNumber(customerNumber);
    if (dto.customerNumber && dto.customerNumber !== customerNumber) {
      const [dup] = await this.db.select({ id: customers.id }).from(customers).where(eq(customers.customerNumber, dto.customerNumber));
      if (dup) throw new ConflictException('Customer number already exists');
    }
    return this.db.transaction(async (tx) => {
      const [c] = await tx.update(customers)
        .set({
          ...(dto.customerNumber ? { customerNumber: dto.customerNumber } : {}),
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.gitUrl !== undefined ? { gitUrl: dto.gitUrl?.trim() || null } : {}),
        })
        .where(eq(customers.id, current.id)).returning();
      await this.changes.log({ entityType: 'Customer', entityId: c.id, action: 'update', reason: dto.reason, author: authorOf(p) }, tx);
      return c;
    });
  }

  @Roles('admin', 'editor') @Post()
  async create(@Body() dto: CreateCustomerDto, @CurrentUser() p: Principal) {
    const [dup] = await this.db.select({ id: customers.id }).from(customers).where(eq(customers.customerNumber, dto.customerNumber));
    if (dup) throw new ConflictException('Customer number already exists');
    return this.db.transaction(async (tx) => {
      const [c] = await tx.insert(customers)
        .values({ customerNumber: dto.customerNumber, name: dto.name.trim(), gitUrl: dto.gitUrl?.trim() || null })
        .returning();
      await this.changes.log({ entityType: 'Customer', entityId: c.id, action: 'create', author: authorOf(p) }, tx);
      return c;
    });
  }
}

@ApiTags('environments') @ApiBearerAuth() @ApiSecurity('api-key')
@Controller('environments')
export class EnvironmentsController {
  constructor(@InjectDb() private db: DB) {}

  @Get() list() { return this.db.select().from(environments).orderBy(environments.name); }

  @Roles('admin') @Post()
  async create(@Body() dto: CreateEnvironmentDto) {
    const [dup] = await this.db.select({ id: environments.id }).from(environments).where(eq(environments.name, dto.name));
    if (dup) throw new ConflictException('Environment already exists');
    const [e] = await this.db.insert(environments).values(dto).returning();
    return e;
  }
}

@Module({ controllers: [CustomersController, EnvironmentsController] })
export class CatalogModule {}

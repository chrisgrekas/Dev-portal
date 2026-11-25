import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { and, asc, eq, exists, ilike, or, sql } from 'drizzle-orm';
import { InjectDb } from '../db/db.module';
import type { DB } from '../db/client';
import { rulesetRules, rulesets, rulesetSteps, workflowCustomers, workflowSteps } from '../db/schema';
import { ChangeLogService } from '../common/changelog.service';
import { ListQuery, offset } from '../common/pagination';
import { setLinks } from '../common/links';
import { authorOf, CurrentUser, Principal, Roles } from '../auth/auth.decorators';

class CreateRulesetDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [Number], description: 'Βήματα workflow όπου τρέχει' })
  @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) stepIds?: number[];
  @ApiPropertyOptional({ type: [Number], description: 'Rules με τη σειρά εκτέλεσης' })
  @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) ruleIds?: number[];
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}
class UpdateRulesetDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) stepIds?: number[];
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) ruleIds?: number[];
  @ApiProperty() @IsString() @IsNotEmpty() reason: string;
}

@Injectable()
export class RulesetsService {
  constructor(@InjectDb() private db: DB, private changes: ChangeLogService) {}

  async list(q: ListQuery) {
    const where = and(
      q.search ? or(ilike(rulesets.name, `%${q.search}%`), ilike(rulesets.description, `%${q.search}%`)) : undefined,
      // «Χωρίς πελάτη»: δεν τρέχει σε βήμα κανενός workflow που ανήκει σε πελάτη.
      q.withoutCustomer
        ? sql`not exists (
            select 1 from ${rulesetSteps}
            join ${workflowSteps} on ${workflowSteps.id} = ${rulesetSteps.stepId}
            join ${workflowCustomers} on ${workflowCustomers.workflowId} = ${workflowSteps.workflowId}
            where ${rulesetSteps.rulesetId} = ${rulesets.id})`
        : undefined,
    );
    const items = await this.db.select().from(rulesets).where(where).orderBy(rulesets.name).limit(q.pageSize).offset(offset(q));
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(rulesets).where(where);
    return { items, total: count, page: q.page, pageSize: q.pageSize };
  }

  async get(id: number) {
    const rs = await this.db.query.rulesets.findFirst({
      where: eq(rulesets.id, id),
      with: {
        rules: { orderBy: [asc(rulesetRules.order)], with: { rule: { columns: { id: true, name: true, description: true } } } },
        steps: { with: { step: { with: { workflow: { columns: { id: true, name: true } } } } } },
      },
    });
    if (!rs) throw new NotFoundException(`Ruleset ${id} not found`);
    return {
      ...rs,
      rules: rs.rules.map((r) => ({ ...r.rule, order: r.order })),
      steps: rs.steps.map((s) => ({ id: s.step.id, name: s.step.name, workflow: s.step.workflow })),
    };
  }

  private async setRules(tx: any, id: number, ruleIds?: number[]) {
    if (ruleIds === undefined) return;
    await tx.delete(rulesetRules).where(eq(rulesetRules.rulesetId, id));
    if (ruleIds.length) await tx.insert(rulesetRules).values(ruleIds.map((ruleId, order) => ({ rulesetId: id, ruleId, order })));
  }

  async create(dto: CreateRulesetDto, author: string) {
    const id = await this.db.transaction(async (tx) => {
      const [rs] = await tx.insert(rulesets).values({ name: dto.name, description: dto.description }).returning();
      await setLinks(tx, rulesetSteps, rulesetSteps.rulesetId, rs.id, 'stepId', 'rulesetId', dto.stepIds);
      await this.setRules(tx, rs.id, dto.ruleIds);
      await this.changes.log({ entityType: 'Ruleset', entityId: rs.id, action: 'create', reason: dto.reason, author }, tx);
      return rs.id;
    });
    return this.get(id);
  }

  async update(id: number, dto: UpdateRulesetDto, author: string) {
    await this.db.transaction(async (tx) => {
      const { reason, stepIds, ruleIds, ...fields } = dto;
      const res = await tx.update(rulesets).set({ ...fields, updatedAt: new Date() }).where(eq(rulesets.id, id)).returning({ id: rulesets.id });
      if (!res.length) throw new NotFoundException(`Ruleset ${id} not found`);
      await setLinks(tx, rulesetSteps, rulesetSteps.rulesetId, id, 'stepId', 'rulesetId', stepIds);
      await this.setRules(tx, id, ruleIds);
      await this.changes.log({ entityType: 'Ruleset', entityId: id, action: 'update', reason, author }, tx);
    });
    return this.get(id);
  }
}

@ApiTags('rulesets') @ApiBearerAuth() @ApiSecurity('api-key')
@Controller('rulesets')
export class RulesetsController {
  constructor(private svc: RulesetsService) {}
  @Get() list(@Query() q: ListQuery) { return this.svc.list(q); }
  @Get(':id') get(@Param('id', ParseIntPipe) id: number) { return this.svc.get(id); }
  @Roles('admin', 'editor') @Post()
  create(@Body() dto: CreateRulesetDto, @CurrentUser() p: Principal) { return this.svc.create(dto, authorOf(p)); }
  @Roles('admin', 'editor') @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRulesetDto, @CurrentUser() p: Principal) {
    return this.svc.update(id, dto, authorOf(p));
  }
}

@Module({ controllers: [RulesetsController], providers: [RulesetsService] })
export class RulesetsModule {}

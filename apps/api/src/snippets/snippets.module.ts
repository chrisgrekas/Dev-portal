import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { and, eq, exists, ilike, or, sql } from 'drizzle-orm';
import { InjectDb } from '../db/db.module';
import type { DB } from '../db/client';
import { snippetCustomers, snippetEnvironments, snippets } from '../db/schema';
import { ChangeLogService } from '../common/changelog.service';
import { ListQuery, offset } from '../common/pagination';
import { setLinks } from '../common/links';
import { authorOf, CurrentUser, Principal, Roles } from '../auth/auth.decorators';

class CreateSnippetDto {
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiPropertyOptional({ description: 'Σε τι χρησιμεύει' }) @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsString() @IsNotEmpty() code: string;
  @ApiPropertyOptional({ default: 'javascript' }) @IsOptional() @IsString() language?: string;
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) customerIds?: number[];
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) environmentIds?: number[];
}
class UpdateSnippetDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() language?: string;
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) customerIds?: number[];
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) environmentIds?: number[];
  @ApiProperty() @IsString() @IsNotEmpty() reason: string;
}

@Injectable()
export class SnippetsService {
  constructor(@InjectDb() private db: DB, private changes: ChangeLogService) {}

  async list(q: ListQuery) {
    const where = and(
      q.search ? or(ilike(snippets.title, `%${q.search}%`), ilike(snippets.description, `%${q.search}%`), ilike(snippets.code, `%${q.search}%`)) : undefined,
      q.customerId ? exists(this.db.select().from(snippetCustomers).where(and(eq(snippetCustomers.snippetId, snippets.id), eq(snippetCustomers.customerId, q.customerId)))) : undefined,
      q.environmentId ? exists(this.db.select().from(snippetEnvironments).where(and(eq(snippetEnvironments.snippetId, snippets.id), eq(snippetEnvironments.environmentId, q.environmentId)))) : undefined,
    );
    const items = await this.db.select().from(snippets).where(where).orderBy(snippets.title).limit(q.pageSize).offset(offset(q));
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(snippets).where(where);
    return { items, total: count, page: q.page, pageSize: q.pageSize };
  }

  async get(id: number) {
    const s = await this.db.query.snippets.findFirst({
      where: eq(snippets.id, id),
      with: { customers: { with: { customer: true } }, environments: { with: { environment: true } } },
    });
    if (!s) throw new NotFoundException(`Snippet ${id} not found`);
    return { ...s, customers: s.customers.map((c) => c.customer), environments: s.environments.map((e) => e.environment) };
  }

  async create(dto: CreateSnippetDto, author: string) {
    const id = await this.db.transaction(async (tx) => {
      const { customerIds, environmentIds, ...fields } = dto;
      const [s] = await tx.insert(snippets).values(fields).returning();
      await setLinks(tx, snippetCustomers, snippetCustomers.snippetId, s.id, 'customerId', 'snippetId', customerIds);
      await setLinks(tx, snippetEnvironments, snippetEnvironments.snippetId, s.id, 'environmentId', 'snippetId', environmentIds);
      await this.changes.log({ entityType: 'Snippet', entityId: s.id, action: 'create', author }, tx);
      return s.id;
    });
    return this.get(id);
  }

  async update(id: number, dto: UpdateSnippetDto, author: string) {
    await this.db.transaction(async (tx) => {
      const { reason, customerIds, environmentIds, ...fields } = dto;
      const res = await tx.update(snippets).set({ ...fields, updatedAt: new Date() }).where(eq(snippets.id, id)).returning({ id: snippets.id });
      if (!res.length) throw new NotFoundException(`Snippet ${id} not found`);
      await setLinks(tx, snippetCustomers, snippetCustomers.snippetId, id, 'customerId', 'snippetId', customerIds);
      await setLinks(tx, snippetEnvironments, snippetEnvironments.snippetId, id, 'environmentId', 'snippetId', environmentIds);
      await this.changes.log({ entityType: 'Snippet', entityId: id, action: 'update', reason, author }, tx);
    });
    return this.get(id);
  }
}

@ApiTags('snippets') @ApiBearerAuth() @ApiSecurity('api-key')
@Controller('snippets')
export class SnippetsController {
  constructor(private svc: SnippetsService) {}
  @Get() list(@Query() q: ListQuery) { return this.svc.list(q); }
  @Get(':id') get(@Param('id', ParseIntPipe) id: number) { return this.svc.get(id); }
  @Roles('admin', 'editor') @Post()
  create(@Body() dto: CreateSnippetDto, @CurrentUser() p: Principal) { return this.svc.create(dto, authorOf(p)); }
  @Roles('admin', 'editor') @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSnippetDto, @CurrentUser() p: Principal) {
    return this.svc.update(id, dto, authorOf(p));
  }
}

@Module({ controllers: [SnippetsController], providers: [SnippetsService] })
export class SnippetsModule {}

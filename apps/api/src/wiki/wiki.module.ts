// Wiki: άρθρα (markdown) + δομημένος κατάλογος πεδίων myClaim/weDAT.
// Όπως παντού: κάθε αλλαγή γράφεται στο ιστορικό, και οι αλλαγές θέλουν αιτιολογία.
import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, ParseIntPipe,
  Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { and, asc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import { InjectDb } from '../db/db.module';
import type { DB } from '../db/client';
import { rules, wikiArticleFields, wikiArticleRules, wikiArticles, wikiFields } from '../db/schema';
import { ChangeLogService } from '../common/changelog.service';
import { ListQuery, offset } from '../common/pagination';
import { authorOf, CurrentUser, Principal, Roles } from '../auth/auth.decorators';

const CATEGORIES = ['guide', 'general', 'rules'] as const;
const SYSTEMS = ['myclaim', 'wedat'] as const;
type Category = (typeof CATEGORIES)[number];
type System = (typeof SYSTEMS)[number];

/** Κενό ή μόνο κενά → null (ώστε η ενότητα να μην εμφανίζεται). Κρατάμε το κείμενο αυτούσιο αλλιώς. */
const blankToNull = (v?: string) => (v === undefined || v.trim() === '' ? null : v.replace(/s+$/, ''));

// ---------- DTOs ----------
class ArticleQuery extends ListQuery {
  @ApiPropertyOptional({ enum: CATEGORIES }) @IsOptional() @IsIn(CATEGORIES) category?: Category;
}
class CreateArticleDto {
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiProperty({ enum: CATEGORIES }) @IsIn(CATEGORIES) category: Category;
  @ApiProperty({ description: 'Markdown' }) @IsString() body: string;
  @ApiPropertyOptional({ type: [Number], description: 'Σχετικά πεδία (με σειρά)' })
  @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) fieldIds?: number[];
  @ApiPropertyOptional({ type: [Number], description: 'Σχετικά rules (με σειρά)' })
  @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) ruleIds?: number[];
  @ApiPropertyOptional({ description: 'Πεδία myClaim, όπως επικολλώνται (ελεύθερο κείμενο). Κενό → αφαιρείται.' })
  @IsOptional() @IsString() myclaimFields?: string;
  @ApiPropertyOptional({ description: 'Πεδία weDAT, όπως επικολλώνται (ελεύθερο κείμενο). Κενό → αφαιρείται.' })
  @IsOptional() @IsString() wedatFields?: string;
}
class UpdateArticleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() title?: string;
  @ApiPropertyOptional({ enum: CATEGORIES }) @IsOptional() @IsIn(CATEGORIES) category?: Category;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) fieldIds?: number[];
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) ruleIds?: number[];
  @ApiPropertyOptional({ description: 'Πεδία myClaim, όπως επικολλώνται (ελεύθερο κείμενο). Κενό → αφαιρείται.' })
  @IsOptional() @IsString() myclaimFields?: string;
  @ApiPropertyOptional({ description: 'Πεδία weDAT, όπως επικολλώνται (ελεύθερο κείμενο). Κενό → αφαιρείται.' })
  @IsOptional() @IsString() wedatFields?: string;
  @ApiProperty() @IsString() @IsNotEmpty() reason: string;
}

class FieldQuery extends ListQuery {
  @ApiPropertyOptional({ enum: SYSTEMS }) @IsOptional() @IsIn(SYSTEMS) system?: System;
}
class CreateFieldDto {
  @ApiProperty({ enum: SYSTEMS }) @IsIn(SYSTEMS) system: System;
  @ApiProperty({ example: 'vin' }) @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiPropertyOptional({ example: 'string' }) @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() example?: string;
}
class UpdateFieldDto {
  @ApiPropertyOptional({ enum: SYSTEMS }) @IsOptional() @IsIn(SYSTEMS) system?: System;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() example?: string;
  @ApiProperty() @IsString() @IsNotEmpty() reason: string;
}

// ---------- Service ----------
@Injectable()
export class WikiService {
  constructor(@InjectDb() private db: DB, private changes: ChangeLogService) {}

  async listArticles(q: ArticleQuery) {
    const where = and(
      q.category ? eq(wikiArticles.category, q.category) : undefined,
      q.search
        ? or(
          ilike(wikiArticles.title, `%${q.search}%`), ilike(wikiArticles.body, `%${q.search}%`),
          ilike(wikiArticles.myclaimFields, `%${q.search}%`), ilike(wikiArticles.wedatFields, `%${q.search}%`),
        )
        : undefined,
    );
    const items = await this.db
      .select({
        id: wikiArticles.id, title: wikiArticles.title, category: wikiArticles.category, updatedAt: wikiArticles.updatedAt,
        excerpt: sql<string>`left(${wikiArticles.body}, 240)`,
      })
      .from(wikiArticles).where(where)
      .orderBy(wikiArticles.category, wikiArticles.title)
      .limit(q.pageSize).offset(offset(q));
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(wikiArticles).where(where);
    return { items, total: count, page: q.page, pageSize: q.pageSize };
  }

  /** Το άρθρο μαζί με τα σχετικά πεδία και rules (με σειρά). */
  async getArticle(id: number) {
    const [a] = await this.db.select().from(wikiArticles).where(eq(wikiArticles.id, id));
    if (!a) throw new NotFoundException(`Article ${id} not found`);
    const fields = await this.db.select({ field: wikiFields }).from(wikiArticleFields)
      .innerJoin(wikiFields, eq(wikiFields.id, wikiArticleFields.fieldId))
      .where(eq(wikiArticleFields.articleId, id)).orderBy(asc(wikiArticleFields.order));
    const relatedRules = await this.db.select({ id: rules.id, name: rules.name, description: rules.description })
      .from(wikiArticleRules).innerJoin(rules, eq(rules.id, wikiArticleRules.ruleId))
      .where(eq(wikiArticleRules.articleId, id)).orderBy(asc(wikiArticleRules.order));
    return { ...a, fields: fields.map((f) => f.field), rules: relatedRules };
  }

  /** 400 αντί για σφάλμα βάσης όταν δοθεί id που δεν υπάρχει. */
  private async ensureExist(kind: 'field' | 'rule', ids?: number[]) {
    if (!ids?.length) return;
    const table = kind === 'field' ? wikiFields : rules;
    const found = await this.db.select({ id: table.id }).from(table).where(inArray(table.id, ids));
    if (found.length !== ids.length) throw new BadRequestException(`Unknown ${kind} id(s)`);
  }

  private async setRelations(tx: Pick<DB, 'insert' | 'delete'>, id: number, fieldIds?: number[], ruleIds?: number[]) {
    if (fieldIds !== undefined) {
      await tx.delete(wikiArticleFields).where(eq(wikiArticleFields.articleId, id));
      if (fieldIds.length) await tx.insert(wikiArticleFields).values(fieldIds.map((fieldId, order) => ({ articleId: id, fieldId, order })));
    }
    if (ruleIds !== undefined) {
      await tx.delete(wikiArticleRules).where(eq(wikiArticleRules.articleId, id));
      if (ruleIds.length) await tx.insert(wikiArticleRules).values(ruleIds.map((ruleId, order) => ({ articleId: id, ruleId, order })));
    }
  }

  async createArticle(dto: CreateArticleDto, author: string) {
    await this.ensureExist('field', dto.fieldIds);
    await this.ensureExist('rule', dto.ruleIds);
    const id = await this.db.transaction(async (tx) => {
      const [a] = await tx.insert(wikiArticles).values({
        title: dto.title.trim(), category: dto.category, body: dto.body,
        myclaimFields: blankToNull(dto.myclaimFields), wedatFields: blankToNull(dto.wedatFields),
      }).returning();
      await this.setRelations(tx, a.id, dto.fieldIds, dto.ruleIds);
      await this.changes.log({ entityType: 'WikiArticle', entityId: a.id, action: 'create', author }, tx);
      return a.id;
    });
    return this.getArticle(id);
  }

  async updateArticle(id: number, dto: UpdateArticleDto, author: string) {
    await this.ensureExist('field', dto.fieldIds);
    await this.ensureExist('rule', dto.ruleIds);
    await this.db.transaction(async (tx) => {
      const { reason, fieldIds, ruleIds, myclaimFields, wedatFields, ...rest } = dto;
      const fields = {
        ...rest,
        ...(myclaimFields !== undefined ? { myclaimFields: blankToNull(myclaimFields) } : {}),
        ...(wedatFields !== undefined ? { wedatFields: blankToNull(wedatFields) } : {}),
      };
      const [a] = await tx.update(wikiArticles).set({ ...fields, updatedAt: new Date() }).where(eq(wikiArticles.id, id)).returning();
      if (!a) throw new NotFoundException(`Article ${id} not found`);
      await this.setRelations(tx, id, fieldIds, ruleIds);
      await this.changes.log({ entityType: 'WikiArticle', entityId: id, action: 'update', reason, author }, tx);
    });
    return this.getArticle(id);
  }

  async deleteArticle(id: number, author: string) {
    return this.db.transaction(async (tx) => {
      const [a] = await tx.delete(wikiArticles).where(eq(wikiArticles.id, id)).returning({ title: wikiArticles.title });
      if (!a) throw new NotFoundException(`Article ${id} not found`);
      await this.changes.log({ entityType: 'WikiArticle', entityId: id, action: `delete "${a.title}"`, author }, tx);
      return { deleted: id };
    });
  }

  async listFields(q: FieldQuery) {
    const where = and(
      q.system ? eq(wikiFields.system, q.system) : undefined,
      q.search
        ? or(ilike(wikiFields.name, `%${q.search}%`), ilike(wikiFields.label, `%${q.search}%`), ilike(wikiFields.description, `%${q.search}%`))
        : undefined,
    );
    const items = await this.db.select().from(wikiFields).where(where)
      .orderBy(wikiFields.system, wikiFields.name).limit(q.pageSize).offset(offset(q));
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(wikiFields).where(where);
    return { items, total: count, page: q.page, pageSize: q.pageSize };
  }

  private async ensureUniqueField(system: System, name: string, exceptId?: number) {
    const [dup] = await this.db.select({ id: wikiFields.id }).from(wikiFields)
      .where(and(eq(wikiFields.system, system), eq(wikiFields.name, name), exceptId ? ne(wikiFields.id, exceptId) : undefined));
    if (dup) throw new ConflictException('Field already exists');
  }

  async createField(dto: CreateFieldDto, author: string) {
    const name = dto.name.trim();
    await this.ensureUniqueField(dto.system, name);
    return this.db.transaction(async (tx) => {
      const [f] = await tx.insert(wikiFields).values({ ...dto, name }).returning();
      await this.changes.log({ entityType: 'WikiField', entityId: f.id, action: `create ${f.system}.${f.name}`, author }, tx);
      return f;
    });
  }

  async updateField(id: number, dto: UpdateFieldDto, author: string) {
    const [current] = await this.db.select().from(wikiFields).where(eq(wikiFields.id, id));
    if (!current) throw new NotFoundException(`Field ${id} not found`);
    const { reason, ...fields } = dto;
    if (fields.name !== undefined) fields.name = fields.name.trim();
    await this.ensureUniqueField(fields.system ?? current.system, fields.name ?? current.name, id);
    return this.db.transaction(async (tx) => {
      const [f] = await tx.update(wikiFields).set({ ...fields, updatedAt: new Date() }).where(eq(wikiFields.id, id)).returning();
      await this.changes.log({ entityType: 'WikiField', entityId: id, action: `update ${f.system}.${f.name}`, reason, author }, tx);
      return f;
    });
  }

  async deleteField(id: number, author: string) {
    return this.db.transaction(async (tx) => {
      const [f] = await tx.delete(wikiFields).where(eq(wikiFields.id, id)).returning();
      if (!f) throw new NotFoundException(`Field ${id} not found`);
      await this.changes.log({ entityType: 'WikiField', entityId: id, action: `delete ${f.system}.${f.name}`, author }, tx);
      return { deleted: id };
    });
  }

  /** Για το sidebar του wiki: όλοι οι τίτλοι άρθρων, πλήθος πεδίων ανά σύστημα, πρόσφατες αλλαγές. */
  async summary() {
    const articles = await this.db
      .select({ id: wikiArticles.id, title: wikiArticles.title, category: wikiArticles.category, updatedAt: wikiArticles.updatedAt })
      .from(wikiArticles).orderBy(wikiArticles.title);
    const counts = await this.db.select({ system: wikiFields.system, count: sql<number>`count(*)::int` })
      .from(wikiFields).groupBy(wikiFields.system);
    const fieldCounts: Record<System, number> = { myclaim: 0, wedat: 0 };
    for (const c of counts) fieldCounts[c.system] = c.count;
    const recent = [...articles].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 6);
    return { articles, fieldCounts, recent };
  }
}

// ---------- Controllers ----------
@ApiTags('wiki') @ApiBearerAuth() @ApiSecurity('api-key')
@Controller('wiki')
export class WikiSummaryController {
  constructor(private svc: WikiService) {}
  @Get('summary') summary() { return this.svc.summary(); }
}

@ApiTags('wiki') @ApiBearerAuth() @ApiSecurity('api-key')
@Controller('wiki/articles')
export class WikiArticlesController {
  constructor(private svc: WikiService) {}
  @Get() list(@Query() q: ArticleQuery) { return this.svc.listArticles(q); }
  @Get(':id') get(@Param('id', ParseIntPipe) id: number) { return this.svc.getArticle(id); }
  @Roles('admin', 'editor') @Post()
  create(@Body() dto: CreateArticleDto, @CurrentUser() p: Principal) { return this.svc.createArticle(dto, authorOf(p)); }
  @Roles('admin', 'editor') @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateArticleDto, @CurrentUser() p: Principal) {
    return this.svc.updateArticle(id, dto, authorOf(p));
  }
  @Roles('admin', 'editor') @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() p: Principal) { return this.svc.deleteArticle(id, authorOf(p)); }
}

@ApiTags('wiki') @ApiBearerAuth() @ApiSecurity('api-key')
@Controller('wiki/fields')
export class WikiFieldsController {
  constructor(private svc: WikiService) {}
  @Get() list(@Query() q: FieldQuery) { return this.svc.listFields(q); }
  @Roles('admin', 'editor') @Post()
  create(@Body() dto: CreateFieldDto, @CurrentUser() p: Principal) { return this.svc.createField(dto, authorOf(p)); }
  @Roles('admin', 'editor') @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFieldDto, @CurrentUser() p: Principal) {
    return this.svc.updateField(id, dto, authorOf(p));
  }
  @Roles('admin', 'editor') @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() p: Principal) { return this.svc.deleteField(id, authorOf(p)); }
}

@Module({ controllers: [WikiSummaryController, WikiArticlesController, WikiFieldsController], providers: [WikiService] })
export class WikiModule {}

// Global Spotlight (⌘K): μία κλήση, αποτελέσματα από πελάτες, άρθρα wiki και πεδία myClaim/weDAT.
import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ilike, or, sql } from 'drizzle-orm';
import { InjectDb } from '../db/db.module';
import type { DB } from '../db/client';
import { customers, wikiArticles, wikiFields } from '../db/schema';

class SearchQuery {
  @ApiProperty({ example: '9000001' }) @IsString() @IsNotEmpty() @MaxLength(200) q: string;
}

@Injectable()
export class SearchService {
  constructor(@InjectDb() private db: DB) {}

  async search(raw: string) {
    const q = raw.trim();
    const like = `%${q}%`;
    const [customerRows, articleRows, fieldRows] = await Promise.all([
      this.db.select({ id: customers.id, customerNumber: customers.customerNumber, name: customers.name }).from(customers)
        // ο αριθμός ταιριάζει από την αρχή, το όνομα οπουδήποτε
        .where(or(ilike(customers.customerNumber, `${q}%`), ilike(customers.name, like)))
        .orderBy(customers.customerNumber).limit(6),
      this.db.select({ id: wikiArticles.id, title: wikiArticles.title, category: wikiArticles.category }).from(wikiArticles)
        .where(or(
          ilike(wikiArticles.title, like), ilike(wikiArticles.body, like),
          ilike(wikiArticles.myclaimFields, like), ilike(wikiArticles.wedatFields, like),
        ))
        // πρώτα όσα ταιριάζουν στον τίτλο
        .orderBy(sql`(${wikiArticles.title} ilike ${like}) desc`, wikiArticles.title).limit(5),
      this.db.select({ id: wikiFields.id, system: wikiFields.system, name: wikiFields.name, label: wikiFields.label, type: wikiFields.type })
        .from(wikiFields)
        .where(or(ilike(wikiFields.name, like), ilike(wikiFields.label, like), ilike(wikiFields.description, like)))
        .orderBy(sql`(${wikiFields.name} ilike ${like}) desc`, wikiFields.name).limit(8),
    ]);
    return { customers: customerRows, articles: articleRows, fields: fieldRows };
  }
}

@ApiTags('search') @ApiBearerAuth() @ApiSecurity('api-key')
@Controller('search')
export class SearchController {
  constructor(private svc: SearchService) {}

  @Get() @ApiOperation({ summary: 'Spotlight: πελάτες, άρθρα wiki, πεδία' })
  search(@Query() q: SearchQuery) {
    return this.svc.search(q.q);
  }
}

@Module({ controllers: [SearchController], providers: [SearchService] })
export class SearchModule {}

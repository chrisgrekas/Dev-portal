// Τύποι ενεργειών για τα Action Cards των rules. Creatable: οι χρήστες προσθέτουν νέους
// (π.χ. «Send Email») από τη φόρμα, και μένουν διαθέσιμοι για όλη την ομάδα.
import { Body, ConflictException, Controller, Get, Module, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ilike, sql } from 'drizzle-orm';
import { InjectDb } from '../db/db.module';
import type { DB } from '../db/client';
import { ACTION_LAYOUTS, ActionLayout, actionTypes } from '../db/schema';
import { ChangeLogService } from '../common/changelog.service';
import { authorOf, CurrentUser, Principal, Roles } from '../auth/auth.decorators';

class ActionTypeQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}
class CreateActionTypeDto {
  @ApiProperty({ example: 'Send Email' }) @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @ApiPropertyOptional({ enum: ACTION_LAYOUTS, default: 'text' }) @IsOptional() @IsIn(ACTION_LAYOUTS) layout?: ActionLayout;
}

@ApiTags('action-types') @ApiBearerAuth() @ApiSecurity('api-key')
@Controller('action-types')
export class ActionTypesController {
  constructor(@InjectDb() private db: DB, private changes: ChangeLogService) {}

  @Get()
  list(@Query() q: ActionTypeQuery) {
    return this.db.select().from(actionTypes)
      .where(q.search ? ilike(actionTypes.name, `%${q.search}%`) : undefined)
      .orderBy(actionTypes.id).limit(200);
  }

  @Roles('admin', 'editor') @Post()
  async create(@Body() dto: CreateActionTypeDto, @CurrentUser() p: Principal) {
    const name = dto.name.trim().replace(/\s+/g, ' ');
    // «send email» και «Send Email» είναι ο ίδιος τύπος.
    const [dup] = await this.db.select({ id: actionTypes.id }).from(actionTypes)
      .where(sql`lower(${actionTypes.name}) = lower(${name})`);
    if (dup) throw new ConflictException('Action type already exists');
    return this.db.transaction(async (tx) => {
      const [t] = await tx.insert(actionTypes).values({ name, layout: dto.layout ?? 'text' }).returning();
      await this.changes.log({ entityType: 'ActionType', entityId: t.id, action: `create "${t.name}"`, author: authorOf(p) }, tx);
      return t;
    });
  }
}

@Module({ controllers: [ActionTypesController] })
export class ActionTypesModule {}

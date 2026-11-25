import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { authorOf, CurrentUser, Principal, Roles } from '../auth/auth.decorators';
import { ListQuery } from '../common/pagination';
import { CreateRuleDto, CreateVersionDto, UpdateRuleDto } from './rules.dto';
import { RulesService } from './rules.service';

@ApiTags('rules') @ApiBearerAuth() @ApiSecurity('api-key')
@Controller('rules')
export class RulesController {
  constructor(private svc: RulesService) {}

  @Get() list(@Query() q: ListQuery) { return this.svc.list(q); }

  @Get(':id') get(@Param('id', ParseIntPipe) id: number) { return this.svc.get(id); }

  @Roles('admin', 'editor') @Post()
  create(@Body() dto: CreateRuleDto, @CurrentUser() p: Principal) { return this.svc.create(dto, authorOf(p)); }

  @Roles('admin', 'editor') @Patch(':id') @ApiOperation({ summary: 'Αλλαγή μεταδεδομένων (όχι κώδικα)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRuleDto, @CurrentUser() p: Principal) {
    return this.svc.update(id, dto, authorOf(p));
  }

  @Get(':id/versions') versions(@Param('id', ParseIntPipe) id: number) { return this.svc.versions(id); }

  @Get(':id/versions/:version')
  version(@Param('id', ParseIntPipe) id: number, @Param('version', ParseIntPipe) v: number) { return this.svc.version(id, v); }

  @Roles('admin', 'editor') @Post(':id/versions') @ApiOperation({ summary: 'Νέα έκδοση κώδικα (η κύρια ενέργεια)' })
  addVersion(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateVersionDto, @CurrentUser() p: Principal) {
    return this.svc.addVersion(id, dto, authorOf(p), p.kind === 'apikey' ? 'sync' : 'manual');
  }
}

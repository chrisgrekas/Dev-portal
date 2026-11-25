import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { authorOf, CurrentUser, Principal, Roles } from '../auth/auth.decorators';
import { ListQuery } from '../common/pagination';
import { CreateStepDto, CreateTransitionDto, CreateWorkflowDto, UpdateStepDto, UpdateWorkflowDto } from './workflows.dto';
import { WorkflowsService } from './workflows.service';

@ApiTags('workflows') @ApiBearerAuth() @ApiSecurity('api-key')
@Controller('workflows')
export class WorkflowsController {
  constructor(private svc: WorkflowsService) {}

  @Get() list(@Query() q: ListQuery) { return this.svc.list(q); }
  @Get(':id') get(@Param('id', ParseIntPipe) id: number) { return this.svc.get(id); }

  @Get(':id/graph') @ApiOperation({ summary: 'Βήματα, μεταβάσεις και rulesets/rules ανά βήμα (για τον γράφο)' })
  graph(@Param('id', ParseIntPipe) id: number) { return this.svc.graph(id); }

  @Roles('admin', 'editor') @Post()
  create(@Body() dto: CreateWorkflowDto, @CurrentUser() p: Principal) { return this.svc.create(dto, authorOf(p)); }

  @Roles('admin', 'editor') @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateWorkflowDto, @CurrentUser() p: Principal) {
    return this.svc.update(id, dto, authorOf(p));
  }

  @Roles('admin', 'editor') @Post(':id/steps')
  addStep(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateStepDto, @CurrentUser() p: Principal) {
    return this.svc.addStep(id, dto, authorOf(p));
  }

  @Roles('admin', 'editor') @Patch(':id/steps/:stepId') @ApiOperation({ summary: 'Αλλαγή βήματος (όνομα, σειρά, σημειώσεις)' })
  updateStep(
    @Param('id', ParseIntPipe) id: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @Body() dto: UpdateStepDto,
    @CurrentUser() p: Principal,
  ) {
    return this.svc.updateStep(id, stepId, dto, authorOf(p));
  }

  @Roles('admin', 'editor') @Post(':id/transitions')
  addTransition(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateTransitionDto, @CurrentUser() p: Principal) {
    return this.svc.addTransition(id, dto, authorOf(p));
  }
}

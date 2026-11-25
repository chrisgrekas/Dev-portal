import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { RulesModule } from './rules/rules.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { RulesetsModule } from './rulesets/rulesets.module';
import { SnippetsModule } from './snippets/snippets.module';
import { CatalogModule } from './catalog/catalog.module';
import { WikiModule } from './wiki/wiki.module';
import { SearchModule } from './search/search.module';
import { ActionTypesModule } from './action-types/action-types.module';

@Module({
  imports: [DbModule, CommonModule, AuthModule, RulesModule, WorkflowsModule, RulesetsModule, SnippetsModule, CatalogModule, WikiModule, SearchModule, ActionTypesModule],
})
export class AppModule {}

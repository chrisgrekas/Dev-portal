import { Global, Module } from '@nestjs/common';
import { ChangeLogService } from './changelog.service';
import { ChangeLogController } from './changelog.controller';

@Global()
@Module({ providers: [ChangeLogService], controllers: [ChangeLogController], exports: [ChangeLogService] })
export class CommonModule {}

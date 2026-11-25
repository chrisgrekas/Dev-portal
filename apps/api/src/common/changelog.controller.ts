import { Controller, Get, Query } from '@nestjs/common';
import { ApiPropertyOptional, ApiSecurity, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ChangeLogService } from './changelog.service';

class ChangeLogQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() entityType?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() entityId?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 50;
}

@ApiTags('changelog') @ApiBearerAuth() @ApiSecurity('api-key')
@Controller('changelog')
export class ChangeLogController {
  constructor(private svc: ChangeLogService) {}

  @Get()
  list(@Query() q: ChangeLogQuery) {
    return this.svc.list(q);
  }
}

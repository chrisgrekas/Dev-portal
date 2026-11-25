import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsInt, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateWorkflowDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty({ description: 'Πότε ενεργοποιείται αυτό το workflow', example: 'Φάκελος χωρίς deeplink' })
  @IsString() @IsNotEmpty() trigger: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() environmentId?: number;
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) customerIds?: number[];
  @ApiPropertyOptional() @IsOptional() @IsObject() extra?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class UpdateWorkflowDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() trigger?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() environmentId?: number;
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) customerIds?: number[];
  @ApiPropertyOptional() @IsOptional() @IsObject() extra?: Record<string, unknown>;
  @ApiProperty() @IsString() @IsNotEmpty() reason: string;
}

export class CreateStepDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() order?: number;
  @ApiPropertyOptional({ description: 'Σημειώσεις: πώς αλλάζει η κατάσταση, τι καλείται κ.λπ.' })
  @IsOptional() @IsString() description?: string;
}

export class UpdateStepDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() order?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsString() @IsNotEmpty() reason: string;
}

export class CreateTransitionDto {
  @ApiProperty() @IsInt() fromStepId: number;
  @ApiProperty() @IsInt() toStepId: number;
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
}

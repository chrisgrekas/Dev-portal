import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// Κοινά query params για όλες τις λίστες: σελίδα, μέγεθος, αναζήτηση, φίλτρα
export class ListQuery {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize: number = 20;

  @ApiPropertyOptional({ description: 'Αναζήτηση σε όνομα/περιγραφή' }) @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  customerId?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  environmentId?: number;

  @ApiPropertyOptional({ description: 'Μόνο όσα δεν ανήκουν σε κανέναν πελάτη (rules, workflows, rulesets)' })
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean()
  withoutCustomer?: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const offset = (q: ListQuery) => (q.page - 1) * q.pageSize;

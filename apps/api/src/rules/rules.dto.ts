import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, ValidateNested,
} from 'class-validator';
import { ACTION_LAYOUTS, ActionLayout } from '../db/schema';

/** Μία ενέργεια (Action Card). Τα πεδία που χρησιμοποιούνται εξαρτώνται από το layout. */
export class RuleActionDto {
  @ApiProperty({ description: 'Σταθερό id από τον client (για diff ανά ενέργεια)' })
  @IsString() @IsNotEmpty() @MaxLength(64) id: string;
  @ApiProperty({ example: 'Call Up URL' }) @IsString() @IsNotEmpty() @MaxLength(80) typeName: string;
  @ApiProperty({ enum: ACTION_LAYOUTS }) @IsIn(ACTION_LAYOUTS) layout: ActionLayout;
  @ApiPropertyOptional({ example: 'Generate Token' }) @IsOptional() @IsString() title?: string;
  // http
  @ApiPropertyOptional({ example: 'POST JSON' }) @IsOptional() @IsString() method?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() url?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() headers?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() request?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() response?: string;
  // code | text
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string;
  // rule_ref (το όνομα το συμπληρώνει ο server)
  @ApiPropertyOptional() @IsOptional() @IsInt() targetRuleId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() targetRuleName?: string;
  // status
  @ApiPropertyOptional({ example: 'Deeplink Completed' }) @IsOptional() @IsString() statusName?: string;
  @ApiPropertyOptional({ example: 'Αν vehicle_selected = YES' }) @IsOptional() @IsString() conditionNote?: string;
}

/** Κοινά πεδία περιεχομένου μιας έκδοσης: κώδικας και/ή δομημένες ενέργειες. */
class VersionContent {
  @ApiPropertyOptional({ description: 'Ελεύθερος κώδικας (προαιρετικός όταν υπάρχουν actions)' })
  @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional({ example: 'Status = Deeplink Completed' }) @IsOptional() @IsString() triggerCondition?: string;
  @ApiPropertyOptional({ type: [RuleActionDto], description: 'Ενέργειες με σειρά εκτέλεσης' })
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => RuleActionDto)
  actions?: RuleActionDto[];
}

export class CreateRuleDto extends VersionContent {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ description: 'ID του rule μέσα στο myClaim (για μελλοντικό sync)' })
  @IsOptional() @IsString() myclaimId?: string;
  @ApiPropertyOptional({ default: 'Αρχική καταχώρηση' }) @IsOptional() @IsString() reason?: string;
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) customerIds?: number[];
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) environmentIds?: number[];
  @ApiPropertyOptional() @IsOptional() @IsObject() extra?: Record<string, unknown>;
}

/** Αλλαγή μεταδεδομένων (όχι κώδικα). Ο κώδικας αλλάζει μόνο με νέα έκδοση. */
export class UpdateRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() myclaimId?: string;
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) customerIds?: number[];
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) environmentIds?: number[];
  @ApiPropertyOptional() @IsOptional() @IsObject() extra?: Record<string, unknown>;
  @ApiProperty({ description: 'Γιατί έγινε η αλλαγή' }) @IsString() @IsNotEmpty() reason: string;
}

export class CreateVersionDto extends VersionContent {
  @ApiProperty({ example: 'Διόρθωση ελέγχου VIN για παλιά οχήματα' }) @IsString() @IsNotEmpty() reason: string;
}

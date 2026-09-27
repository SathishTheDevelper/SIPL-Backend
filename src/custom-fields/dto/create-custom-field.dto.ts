import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CustomFieldType } from '../enums/field-type.enum';

export class CustomFieldValidationDto {
  @ApiPropertyOptional()
  @IsOptional()
  min?: number;

  @ApiPropertyOptional()
  @IsOptional()
  max?: number;

  @ApiPropertyOptional()
  @IsOptional()
  minLength?: number;

  @ApiPropertyOptional()
  @IsOptional()
  maxLength?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pattern?: string;
}

export class CreateCustomFieldDto {
  @ApiProperty({ example: 'PROJECT' })
  @IsString()
  @Matches(/^[A-Z0-9_]{2,40}$/)
  module!: string;

  @ApiProperty({ example: 'site_soil_type' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,40}$/)
  key!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  label!: string;

  @ApiProperty({ enum: CustomFieldType })
  @IsEnum(CustomFieldType)
  fieldType!: CustomFieldType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  defaultValue?: unknown;

  @ApiPropertyOptional({ type: CustomFieldValidationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomFieldValidationDto)
  validation?: CustomFieldValidationDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCustomFieldDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  defaultValue?: unknown;

  @ApiPropertyOptional({ type: CustomFieldValidationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomFieldValidationDto)
  validation?: CustomFieldValidationDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

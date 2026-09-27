import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateCalendarDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional({ default: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ type: [Number], default: [1, 2, 3, 4, 5] })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  workingDays?: number[];

  @ApiPropertyOptional({ default: '09:00' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  workingStartTime?: string;

  @ApiPropertyOptional({ default: '18:00' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  workingEndTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class CreateHolidayDto {
  @ApiProperty()
  @IsMongoId()
  calendarId!: string;

  @ApiProperty({ example: '2026-01-26' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiProperty()
  @IsString()
  name!: string;
}

export class UpsertSlaConfigurationDto {
  @ApiProperty({ example: 'MATERIAL_APPROVAL' })
  @IsString()
  module!: string;

  @ApiProperty({ example: 8 })
  @IsNumber()
  @Min(0.25)
  hours!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  calendarId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  escalateToRole?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  escalateToUser?: string;
}

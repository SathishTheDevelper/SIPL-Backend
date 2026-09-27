import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ClientDecisionType } from '../enums/client-decision.enum';

export class RecordClientDecisionDto {
  @ApiProperty({ enum: ClientDecisionType })
  @IsEnum(ClientDecisionType)
  decision!: ClientDecisionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  decisionDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional({
    description: 'Mandatory when decision is LOSE',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  reason?: string;
}

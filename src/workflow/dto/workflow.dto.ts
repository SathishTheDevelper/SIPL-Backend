import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ApproverType,
  WorkflowActionType,
  WorkflowStepType,
} from '../enums/workflow.enums';

export class WorkflowStepDto {
  @ApiProperty()
  @IsNumber()
  @Min(1)
  sequence!: number;

  @ApiPropertyOptional({ enum: WorkflowStepType })
  @IsOptional()
  @IsEnum(WorkflowStepType)
  stepType?: WorkflowStepType;

  @ApiProperty({ enum: ApproverType })
  @IsEnum(ApproverType)
  approverType!: ApproverType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  approverRole?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  approverUser?: string;

  @ApiPropertyOptional({
    description:
      'SLA hours for this step. Read from tenant SLA config if omitted.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0.25)
  slaHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  actions?: string[];
}

export class CreateWorkflowDefinitionDto {
  @ApiProperty({ example: 'MATERIAL_APPROVAL' })
  @IsString()
  module!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ type: [WorkflowStepDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps!: WorkflowStepDto[];
}

export class StartWorkflowDto {
  @ApiProperty({ example: 'MATERIAL_APPROVAL' })
  @IsString()
  module!: string;

  @ApiProperty()
  @IsString()
  entityType!: string;

  @ApiProperty()
  @IsString()
  entityId!: string;

  @ApiPropertyOptional({
    description:
      'Business context used by the backend to resolve approvers. Must not include a frontend-chosen approver.',
  })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

export class WorkflowActDto {
  @ApiProperty({ enum: WorkflowActionType })
  @IsEnum(WorkflowActionType)
  action!: WorkflowActionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

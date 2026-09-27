import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  ApproverType,
  WorkflowStatus,
  WorkflowStepType,
} from '../enums/workflow.enums';

export type WorkflowDefinitionDocument = HydratedDocument<WorkflowDefinition>;

@Schema({ _id: true })
export class WorkflowStep {
  _id!: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  sequence!: number;

  @Prop({
    type: String,
    enum: Object.values(WorkflowStepType),
    default: WorkflowStepType.APPROVAL,
  })
  stepType!: WorkflowStepType;

  @Prop({ type: String, enum: Object.values(ApproverType), required: true })
  approverType!: ApproverType;

  @Prop({ trim: true })
  approverRole?: string;

  @Prop({ type: Types.ObjectId })
  approverUser?: Types.ObjectId;

  @Prop({ min: 0.25 })
  slaHours?: number;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  conditions?: Record<string, unknown>;

  @Prop({
    type: [String],
    default: ['APPROVE', 'REJECT', 'SEND_BACK', 'ESCALATE'],
  })
  actions!: string[];
}

@Schema({ timestamps: true, collection: 'workflow_definitions' })
export class WorkflowDefinition {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, uppercase: true, trim: true })
  module!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, min: 1, default: 1 })
  version!: number;

  @Prop({
    type: String,
    enum: Object.values(WorkflowStatus),
    default: WorkflowStatus.DRAFT,
  })
  status!: WorkflowStatus;

  @Prop({ type: [WorkflowStep], default: [] })
  steps!: WorkflowStep[];
}

export const WorkflowDefinitionSchema =
  SchemaFactory.createForClass(WorkflowDefinition);

WorkflowDefinitionSchema.index({ tenantId: 1, module: 1, version: 1 });
WorkflowDefinitionSchema.index({ tenantId: 1, module: 1, status: 1 });

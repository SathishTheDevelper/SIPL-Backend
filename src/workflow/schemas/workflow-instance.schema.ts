import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { WorkflowInstanceStatus } from '../enums/workflow.enums';

export type WorkflowInstanceDocument = HydratedDocument<WorkflowInstance>;

@Schema({ timestamps: true, collection: 'workflow_instances' })
export class WorkflowInstance {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'WorkflowDefinition' })
  definitionId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  module!: string;

  @Prop({ required: true, trim: true })
  entityType!: string;

  @Prop({ required: true, trim: true })
  entityId!: string;

  @Prop({ required: true, min: 1 })
  currentStep!: number;

  @Prop({
    type: String,
    enum: Object.values(WorkflowInstanceStatus),
    default: WorkflowInstanceStatus.IN_PROGRESS,
  })
  status!: WorkflowInstanceStatus;

  @Prop({ type: Types.ObjectId })
  currentApproverUserId?: Types.ObjectId;

  @Prop({ trim: true })
  currentApproverRole?: string;

  @Prop({ type: Types.ObjectId, required: true })
  startedBy!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  context!: Record<string, unknown>;

  @Prop({ default: 1 })
  version!: number;
}

export const WorkflowInstanceSchema =
  SchemaFactory.createForClass(WorkflowInstance);

WorkflowInstanceSchema.index({ tenantId: 1, status: 1, currentStep: 1 });
WorkflowInstanceSchema.index({ tenantId: 1, entityType: 1, entityId: 1 });
WorkflowInstanceSchema.index({
  tenantId: 1,
  currentApproverUserId: 1,
  status: 1,
});
WorkflowInstanceSchema.index({ tenantId: 1, createdAt: -1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { WorkflowActionType } from '../enums/workflow.enums';

export type WorkflowActionDocument = HydratedDocument<WorkflowAction>;

@Schema({ timestamps: true, collection: 'workflow_actions' })
export class WorkflowAction {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  instanceId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(WorkflowActionType),
    required: true,
  })
  action!: WorkflowActionType;

  @Prop({ type: Types.ObjectId, required: true })
  actorUserId!: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  fromStep!: number;

  @Prop()
  toStep?: number;

  @Prop({ trim: true })
  reason?: string;
}

export const WorkflowActionSchema =
  SchemaFactory.createForClass(WorkflowAction);

WorkflowActionSchema.index({ tenantId: 1, instanceId: 1, createdAt: -1 });

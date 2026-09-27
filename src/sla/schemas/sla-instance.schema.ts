import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SlaInstanceStatus } from '../enums/sla-status.enum';

export type SlaInstanceDocument = HydratedDocument<SlaInstance>;

@Schema({ timestamps: true, collection: 'sla_instances' })
export class SlaInstance {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  module!: string;

  @Prop({ required: true, trim: true })
  entityType!: string;

  @Prop({ required: true, trim: true })
  entityId!: string;

  @Prop({ type: Types.ObjectId })
  workflowInstanceId?: Types.ObjectId;

  @Prop({ required: true })
  hours!: number;

  @Prop({ required: true })
  startedAt!: Date;

  @Prop({ required: true })
  dueAt!: Date;

  @Prop({
    type: String,
    enum: Object.values(SlaInstanceStatus),
    default: SlaInstanceStatus.PENDING,
  })
  status!: SlaInstanceStatus;

  @Prop({ type: Date })
  breachedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;
}

export const SlaInstanceSchema = SchemaFactory.createForClass(SlaInstance);

SlaInstanceSchema.index({ tenantId: 1, status: 1, dueAt: 1 });
SlaInstanceSchema.index({ tenantId: 1, entityType: 1, entityId: 1 });
SlaInstanceSchema.index({ tenantId: 1, workflowInstanceId: 1 });

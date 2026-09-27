import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { EscalationStatus } from '../enums/sla-status.enum';

export type EscalationEventDocument = HydratedDocument<EscalationEvent>;

@Schema({ timestamps: true, collection: 'escalation_events' })
export class EscalationEvent {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  slaInstanceId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  module!: string;

  @Prop({ required: true, trim: true })
  entityType!: string;

  @Prop({ required: true, trim: true })
  entityId!: string;

  @Prop({ trim: true })
  escalateToRole?: string;

  @Prop({ type: Types.ObjectId })
  escalateToUser?: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(EscalationStatus),
    default: EscalationStatus.OPEN,
  })
  status!: EscalationStatus;
}

export const EscalationEventSchema =
  SchemaFactory.createForClass(EscalationEvent);

EscalationEventSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

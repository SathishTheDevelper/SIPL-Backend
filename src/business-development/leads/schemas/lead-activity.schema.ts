import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LeadActivityDocument = HydratedDocument<LeadActivity>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'lead_activities',
})
export class LeadActivity {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Lead' })
  leadId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  type!: string;

  @Prop({ required: true, trim: true })
  note!: string;

  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;
}

export const LeadActivitySchema = SchemaFactory.createForClass(LeadActivity);
LeadActivitySchema.index({ tenantId: 1, leadId: 1, createdAt: -1 });

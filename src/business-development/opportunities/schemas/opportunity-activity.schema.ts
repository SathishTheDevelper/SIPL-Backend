import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OpportunityActivityDocument = HydratedDocument<OpportunityActivity>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'opportunity_activities',
})
export class OpportunityActivity {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Opportunity' })
  opportunityId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  type!: string;

  @Prop({ required: true, trim: true })
  note!: string;

  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;
}

export const OpportunityActivitySchema =
  SchemaFactory.createForClass(OpportunityActivity);
OpportunityActivitySchema.index({
  tenantId: 1,
  opportunityId: 1,
  createdAt: -1,
});

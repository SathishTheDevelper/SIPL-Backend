import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  OpportunityStage,
  OpportunityStatus,
} from '../enums/opportunity.enums';

export type OpportunityDocument = HydratedDocument<Opportunity>;

@Schema({ timestamps: true, collection: 'opportunities' })
export class Opportunity {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  opportunityNumber!: string;

  @Prop({ type: Types.ObjectId, ref: 'Lead' })
  leadId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  clientName!: string;

  @Prop({ trim: true })
  clientContact?: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ min: 0 })
  estimatedValue?: number;

  @Prop({ min: 0, max: 100 })
  probability?: number;

  @Prop({ type: Date })
  expectedCloseDate?: Date;

  @Prop({
    type: String,
    enum: Object.values(OpportunityStage),
    default: OpportunityStage.IDENTIFIED,
  })
  stage!: OpportunityStage;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  owner?: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(OpportunityStatus),
    default: OpportunityStatus.OPEN,
  })
  status!: OpportunityStatus;

  @Prop({ trim: true })
  lostReason?: string;

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;
}

export const OpportunitySchema = SchemaFactory.createForClass(Opportunity);
OpportunitySchema.index(
  { tenantId: 1, opportunityNumber: 1 },
  { unique: true },
);
OpportunitySchema.index({ tenantId: 1, leadId: 1 });
OpportunitySchema.index({ tenantId: 1, status: 1 });
OpportunitySchema.index({ tenantId: 1, stage: 1 });

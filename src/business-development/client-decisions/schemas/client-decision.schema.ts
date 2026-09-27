import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ClientDecisionType } from '../enums/client-decision.enum';

export type ClientDecisionDocument = HydratedDocument<ClientDecision>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'client_decisions',
})
export class ClientDecision {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Quotation' })
  quotationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Tender' })
  tenderId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Opportunity' })
  opportunityId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project' })
  projectId?: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(ClientDecisionType),
    required: true,
  })
  decision!: ClientDecisionType;

  @Prop({ type: Date, required: true })
  decisionDate!: Date;

  @Prop({ trim: true })
  remarks?: string;

  @Prop({ trim: true })
  reason?: string;

  @Prop({ type: Types.ObjectId, required: true })
  recordedBy!: Types.ObjectId;
}

export const ClientDecisionSchema =
  SchemaFactory.createForClass(ClientDecision);
ClientDecisionSchema.index({ tenantId: 1, quotationId: 1 }, { unique: true });
ClientDecisionSchema.index({ tenantId: 1, tenderId: 1 });

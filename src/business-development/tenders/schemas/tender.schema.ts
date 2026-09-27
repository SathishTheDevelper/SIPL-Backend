import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TenderStatus } from '../enums/tender-status.enum';

export type TenderDocument = HydratedDocument<Tender>;

@Schema({ timestamps: true, collection: 'tenders' })
export class Tender {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  tenderNumber!: string;

  @Prop({ type: Types.ObjectId, ref: 'Opportunity' })
  opportunityId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true })
  clientName!: string;

  @Prop({ trim: true })
  referenceNumber?: string;

  @Prop({ type: Date })
  issueDate?: Date;

  @Prop({ type: Date })
  submissionDate?: Date;

  @Prop({ min: 0 })
  estimatedValue?: number;

  @Prop({ trim: true })
  description?: string;

  @Prop({
    type: String,
    enum: Object.values(TenderStatus),
    default: TenderStatus.DRAFT,
  })
  status!: TenderStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedTo?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  owner?: Types.ObjectId;

  @Prop({ trim: true })
  lostReason?: string;

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;
}

export const TenderSchema = SchemaFactory.createForClass(Tender);
TenderSchema.index({ tenantId: 1, tenderNumber: 1 }, { unique: true });
TenderSchema.index({ tenantId: 1, opportunityId: 1 });
TenderSchema.index({ tenantId: 1, status: 1 });
TenderSchema.index({ tenantId: 1, submissionDate: 1 });

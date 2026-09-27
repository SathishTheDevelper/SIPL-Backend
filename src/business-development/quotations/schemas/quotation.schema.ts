import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { QuotationStatus } from '../enums/quotation-status.enum';

export type QuotationDocument = HydratedDocument<Quotation>;

@Schema({ _id: true })
export class QuotationItem {
  _id!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  description!: string;

  @Prop({ required: true, min: 0 })
  quantity!: number;

  @Prop({ trim: true })
  unit?: string;

  @Prop({ required: true, min: 0 })
  rate!: number;

  @Prop({ min: 0, default: 0 })
  discount!: number;

  @Prop({ min: 0, default: 0 })
  taxRate!: number;

  @Prop({ min: 0, default: 0 })
  taxAmount!: number;

  @Prop({ min: 0, default: 0 })
  amount!: number;

  @Prop({ trim: true })
  remarks?: string;

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;
}

@Schema({ timestamps: true, collection: 'quotations' })
export class Quotation {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  quotationNumber!: string;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Tender' })
  tenderId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Opportunity' })
  opportunityId?: Types.ObjectId;

  @Prop({ required: true, min: 1, default: 1 })
  version!: number;

  @Prop({ type: Types.ObjectId, ref: 'Quotation' })
  previousQuotationId?: Types.ObjectId;

  @Prop({ default: true })
  isCurrent!: boolean;

  @Prop({ type: Date, required: true })
  quotationDate!: Date;

  @Prop({ type: Date })
  validUntil?: Date;

  @Prop({ required: true, min: 0, default: 0 })
  subtotal!: number;

  @Prop({ required: true, min: 0, default: 0 })
  discount!: number;

  @Prop({ required: true, min: 0, default: 0 })
  tax!: number;

  @Prop({ required: true, min: 0, default: 0 })
  total!: number;

  @Prop({ required: true, default: 'INR' })
  currency!: string;

  @Prop({ trim: true })
  paymentTerms?: string;

  @Prop({ trim: true })
  deliveryTerms?: string;

  @Prop({
    type: String,
    enum: Object.values(QuotationStatus),
    default: QuotationStatus.DRAFT,
  })
  status!: QuotationStatus;

  @Prop({ type: [QuotationItem], default: [] })
  items!: QuotationItem[];

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;
}

export const QuotationSchema = SchemaFactory.createForClass(Quotation);
QuotationSchema.index({ tenantId: 1, quotationNumber: 1 }, { unique: true });
QuotationSchema.index({ tenantId: 1, tenderId: 1, isCurrent: 1 });
QuotationSchema.index({ tenantId: 1, status: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { InvoiceMatchStatus } from '../enums/invoice-match-status.enum';
import { InvoiceStatus } from '../enums/invoice-status.enum';
import { InvoiceType } from '../enums/invoice-type.enum';

export type InvoiceDocument = HydratedDocument<Invoice>;

@Schema({ timestamps: true, collection: 'invoices' })
export class Invoice {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  invoiceNumber!: string;

  @Prop({ required: true, trim: true })
  vendorInvoiceNumber!: string;

  @Prop({
    type: String,
    enum: Object.values(InvoiceType),
    default: InvoiceType.MATERIAL,
  })
  invoiceType!: InvoiceType;

  @Prop({ required: true })
  invoiceDate!: Date;

  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ type: Date })
  submittedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  vendorId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  vendorName!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  purchaseOrderId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  poNumber!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  projectId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  siteId!: Types.ObjectId;

  @Prop({ required: true, trim: true, default: 'INR' })
  currency!: string;

  @Prop({ required: true, default: 0 })
  subtotal!: number;

  @Prop({ required: true, default: 0 })
  taxAmount!: number;

  @Prop({ required: true, default: 0 })
  discountAmount!: number;

  @Prop({ required: true, default: 0 })
  additionalCharges!: number;

  @Prop({ required: true, default: 0 })
  totalAmount!: number;

  @Prop({
    type: String,
    enum: Object.values(InvoiceStatus),
    default: InvoiceStatus.DRAFT,
  })
  status!: InvoiceStatus;

  @Prop({
    type: String,
    enum: Object.values(InvoiceMatchStatus),
    default: InvoiceMatchStatus.PENDING,
  })
  matchStatus!: InvoiceMatchStatus;

  @Prop({ trim: true })
  paymentTerms?: string;

  @Prop({ trim: true })
  remarks?: string;

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;

  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] })
  attachments!: Types.ObjectId[];

  @Prop({ trim: true })
  holdReason?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  heldBy?: Types.ObjectId;

  @Prop({ type: Date })
  heldAt?: Date;

  @Prop({ trim: true })
  rejectionReason?: string;

  @Prop({ trim: true })
  cancellationReason?: string;

  @Prop({ default: false })
  correctionOpen!: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  workflowInstanceId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  latestMatchResultId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  updatedBy?: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

InvoiceSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
InvoiceSchema.index(
  { tenantId: 1, vendorId: 1, vendorInvoiceNumber: 1 },
  { unique: true },
);
InvoiceSchema.index({ tenantId: 1, vendorId: 1, invoiceDate: -1 });
InvoiceSchema.index({ tenantId: 1, purchaseOrderId: 1, status: 1 });
InvoiceSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
InvoiceSchema.index({ tenantId: 1, matchStatus: 1, createdAt: -1 });
InvoiceSchema.index({ tenantId: 1, projectId: 1, status: 1 });
InvoiceSchema.index({ tenantId: 1, siteId: 1, status: 1 });
InvoiceSchema.index({ tenantId: 1, poNumber: 1 });
InvoiceSchema.index({ tenantId: 1, invoiceDate: -1 });
InvoiceSchema.index({ tenantId: 1, submittedAt: -1 });
InvoiceSchema.index({ tenantId: 1, totalAmount: 1 });
InvoiceSchema.index({ tenantId: 1, createdAt: -1 });

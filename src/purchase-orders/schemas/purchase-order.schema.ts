import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  PurchaseOrderApprovalStatus,
  PurchaseOrderStatus,
} from '../enums/purchase-order.enums';

export type PurchaseOrderDocument = HydratedDocument<PurchaseOrder>;

@Schema({ timestamps: true, collection: 'purchase_orders' })
export class PurchaseOrder {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  poNumber!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  purchaseApprovalId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  procurementRequestId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  comparisonStatementId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  vendorSelectionId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  projectId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  siteId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  vendorId!: Types.ObjectId;

  @Prop({ required: true })
  poDate!: Date;

  @Prop({ type: Date })
  expectedDeliveryDate?: Date;

  @Prop({ required: true, trim: true, default: 'INR' })
  currency!: string;

  @Prop({ trim: true })
  paymentTerms?: string;

  @Prop({ trim: true })
  deliveryTerms?: string;

  @Prop({ required: true, default: 0 })
  subtotal!: number;

  @Prop({ required: true, default: 0 })
  discount!: number;

  @Prop({ required: true, default: 0 })
  taxAmount!: number;

  @Prop({ required: true, default: 0 })
  additionalChargesTotal!: number;

  @Prop({ required: true, default: 0 })
  grandTotal!: number;

  @Prop({
    type: String,
    enum: Object.values(PurchaseOrderStatus),
    default: PurchaseOrderStatus.DRAFT,
  })
  status!: PurchaseOrderStatus;

  @Prop({
    type: String,
    enum: Object.values(PurchaseOrderApprovalStatus),
    default: PurchaseOrderApprovalStatus.NOT_STARTED,
  })
  approvalStatus!: PurchaseOrderApprovalStatus;

  @Prop({ trim: true })
  remarks?: string;

  @Prop({ trim: true })
  cancellationReason?: string;

  @Prop({ type: Date })
  acknowledgedAt?: Date;

  @Prop({ trim: true })
  acknowledgementRemarks?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  workflowInstanceId?: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  updatedBy?: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);

PurchaseOrderSchema.index({ tenantId: 1, poNumber: 1 }, { unique: true });
PurchaseOrderSchema.index(
  { tenantId: 1, purchaseApprovalId: 1 },
  { unique: true },
);
PurchaseOrderSchema.index({ tenantId: 1, projectId: 1, status: 1 });
PurchaseOrderSchema.index({ tenantId: 1, vendorId: 1, status: 1 });
PurchaseOrderSchema.index({ tenantId: 1, status: 1 });
PurchaseOrderSchema.index({ tenantId: 1, createdAt: -1 });

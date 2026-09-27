import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type PurchaseOrderItemDocument = HydratedDocument<PurchaseOrderItem>;

@Schema({ timestamps: true, collection: 'purchase_order_items' })
export class PurchaseOrderItem {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  purchaseOrderId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  materialId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  boqItemId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  rfqItemId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  vendorQuotationItemId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  vendorSelectionItemId?: Types.ObjectId;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, min: 0 })
  quantity!: number;

  @Prop({ required: true, min: 0, default: 0 })
  receivedQuantity!: number;

  @Prop({ required: true, min: 0, default: 0 })
  pendingQuantity!: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  unitId!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  unitRate!: number;

  @Prop({ required: true, min: 0, default: 0 })
  discount!: number;

  @Prop({ required: true, min: 0, default: 0 })
  taxRate!: number;

  @Prop({ required: true, min: 0, default: 0 })
  taxAmount!: number;

  @Prop({ required: true, min: 0, default: 0 })
  lineTotal!: number;

  @Prop({ type: Date })
  expectedDeliveryDate?: Date;

  @Prop({ trim: true })
  remarks?: string;

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PurchaseOrderItemSchema =
  SchemaFactory.createForClass(PurchaseOrderItem);

PurchaseOrderItemSchema.index({ tenantId: 1, purchaseOrderId: 1 });
PurchaseOrderItemSchema.index({ tenantId: 1, materialId: 1 });

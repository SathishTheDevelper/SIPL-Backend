import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { PurchaseOrderChargeType } from '../enums/purchase-order.enums';

export type PurchaseOrderChargeDocument = HydratedDocument<PurchaseOrderCharge>;

@Schema({
  timestamps: { createdAt: true, updatedAt: true },
  collection: 'purchase_order_charges',
})
export class PurchaseOrderCharge {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  purchaseOrderId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  projectId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  vendorId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(PurchaseOrderChargeType),
    required: true,
  })
  chargeType!: PurchaseOrderChargeType;

  @Prop({ required: true, trim: true })
  description!: string;

  @Prop({ required: true, min: 0 })
  amount!: number;

  @Prop({ required: true, min: 0, default: 0 })
  taxRate!: number;

  @Prop({ required: true, min: 0, default: 0 })
  taxAmount!: number;

  @Prop({ required: true, min: 0, default: 0 })
  totalAmount!: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PurchaseOrderChargeSchema =
  SchemaFactory.createForClass(PurchaseOrderCharge);

PurchaseOrderChargeSchema.index({ tenantId: 1, purchaseOrderId: 1 });
PurchaseOrderChargeSchema.index({ tenantId: 1, projectId: 1 });

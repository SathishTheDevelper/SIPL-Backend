import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type PurchaseOrderApprovalReferenceDocument =
  HydratedDocument<PurchaseOrderApprovalReference>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'purchase_order_approval_references',
})
export class PurchaseOrderApprovalReference {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  purchaseOrderId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  action!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  actorUserId!: Types.ObjectId;

  @Prop({ trim: true })
  reason?: string;

  @Prop({ required: true, trim: true })
  instanceStatus!: string;

  createdAt!: Date;
}

export const PurchaseOrderApprovalReferenceSchema =
  SchemaFactory.createForClass(PurchaseOrderApprovalReference);

PurchaseOrderApprovalReferenceSchema.index({
  tenantId: 1,
  purchaseOrderId: 1,
  createdAt: -1,
});

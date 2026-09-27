import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type DeliveryItemDocument = HydratedDocument<DeliveryItem>;

@Schema({ timestamps: true, collection: 'delivery_items' })
export class DeliveryItem {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  deliveryId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  purchaseOrderItemId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  materialId!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  quantity!: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  unitId!: Types.ObjectId;

  @Prop({ trim: true })
  remarks?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const DeliveryItemSchema = SchemaFactory.createForClass(DeliveryItem);
DeliveryItemSchema.index({ tenantId: 1, deliveryId: 1 });
DeliveryItemSchema.index({ tenantId: 1, purchaseOrderItemId: 1 });

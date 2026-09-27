import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type GrnItemDocument = HydratedDocument<GrnItem>;

@Schema({ timestamps: true, collection: 'grn_items' })
export class GrnItem {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  grnId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  purchaseOrderItemId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  materialId!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  orderedQuantity!: number;

  @Prop({ required: true, min: 0 })
  previouslyReceivedQuantity!: number;

  @Prop({ required: true, min: 0 })
  receivedQuantity!: number;

  @Prop({ required: true, min: 0 })
  acceptedQuantity!: number;

  @Prop({ required: true, min: 0 })
  rejectedQuantity!: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  unitId!: Types.ObjectId;

  @Prop({ trim: true })
  remarks?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const GrnItemSchema = SchemaFactory.createForClass(GrnItem);
GrnItemSchema.index({ tenantId: 1, grnId: 1 });
GrnItemSchema.index({ tenantId: 1, purchaseOrderItemId: 1 });

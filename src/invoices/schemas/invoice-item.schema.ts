import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type InvoiceItemDocument = HydratedDocument<InvoiceItem>;

@Schema({ timestamps: true, collection: 'invoice_items' })
export class InvoiceItem {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  invoiceId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  purchaseOrderItemId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  materialId!: Types.ObjectId;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, min: 0 })
  orderedQuantity!: number;

  @Prop({ required: true, min: 0 })
  invoicedQuantity!: number;

  @Prop({ required: true, min: 0 })
  receivedQuantity!: number;

  @Prop({ required: true, trim: true })
  unit!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  unitId!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  unitPrice!: number;

  @Prop({ required: true, min: 0, default: 0 })
  taxRate!: number;

  @Prop({ required: true, min: 0, default: 0 })
  taxAmount!: number;

  @Prop({ required: true, min: 0, default: 0 })
  discountAmount!: number;

  @Prop({ required: true, min: 0 })
  lineAmount!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const InvoiceItemSchema = SchemaFactory.createForClass(InvoiceItem);
InvoiceItemSchema.index({ tenantId: 1, invoiceId: 1 });
InvoiceItemSchema.index({ tenantId: 1, purchaseOrderItemId: 1 });

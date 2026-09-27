import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { InvoiceReferenceType } from '../enums/invoice-reference-type.enum';

export type InvoiceReferenceDocument = HydratedDocument<InvoiceReference>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'invoice_references',
})
export class InvoiceReference {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  invoiceId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  purchaseOrderId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  grnId?: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(InvoiceReferenceType),
    required: true,
  })
  referenceType!: InvoiceReferenceType;

  @Prop({ required: true, trim: true })
  referenceNumber!: string;

  createdAt!: Date;
}

export const InvoiceReferenceSchema =
  SchemaFactory.createForClass(InvoiceReference);

InvoiceReferenceSchema.index({ tenantId: 1, invoiceId: 1 });
InvoiceReferenceSchema.index({ tenantId: 1, purchaseOrderId: 1 });
InvoiceReferenceSchema.index({ tenantId: 1, grnId: 1 }, { sparse: true });

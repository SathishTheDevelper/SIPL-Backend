import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type InvoiceMatchLockDocument = HydratedDocument<InvoiceMatchLock>;

@Schema({ timestamps: true, collection: 'invoice_match_locks' })
export class InvoiceMatchLock {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  purchaseOrderId!: Types.ObjectId;

  @Prop({ required: true, default: 0 })
  version!: number;
}

export const InvoiceMatchLockSchema =
  SchemaFactory.createForClass(InvoiceMatchLock);

InvoiceMatchLockSchema.index(
  { tenantId: 1, purchaseOrderId: 1 },
  { unique: true },
);

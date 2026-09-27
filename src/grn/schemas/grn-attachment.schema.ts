import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type GrnAttachmentDocument = HydratedDocument<GrnAttachment>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'grn_attachments',
})
export class GrnAttachment {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true, default: 'GRN' })
  entityType!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  entityId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  fileName!: string;

  @Prop({ required: true, trim: true })
  mimeType!: string;

  @Prop({ required: true, min: 0 })
  size!: number;

  @Prop({ required: true, trim: true })
  storageKey!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  uploadedBy!: Types.ObjectId;

  createdAt!: Date;
}

export const GrnAttachmentSchema = SchemaFactory.createForClass(GrnAttachment);
GrnAttachmentSchema.index({ tenantId: 1, entityId: 1 });

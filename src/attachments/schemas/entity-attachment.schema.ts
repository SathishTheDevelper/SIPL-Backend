import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type EntityAttachmentDocument = HydratedDocument<EntityAttachment>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'entity_attachments',
})
export class EntityAttachment {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
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

export const EntityAttachmentSchema =
  SchemaFactory.createForClass(EntityAttachment);

EntityAttachmentSchema.index({ tenantId: 1, entityType: 1, entityId: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { GrnStatus } from '../enums/grn.enums';

export type GrnDocument = HydratedDocument<Grn>;

@Schema({ timestamps: true, collection: 'grns' })
export class Grn {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  grnNumber!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  purchaseOrderId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  deliveryId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  projectId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  siteId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  vendorId!: Types.ObjectId;

  @Prop({ required: true })
  grnDate!: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  receivedBy!: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(GrnStatus),
    default: GrnStatus.DRAFT,
  })
  status!: GrnStatus;

  @Prop({ trim: true })
  remarks?: string;

  @Prop({ trim: true })
  rejectionReason?: string;

  @Prop({ trim: true })
  cancellationReason?: string;

  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] })
  attachments!: Types.ObjectId[];

  @Prop({ type: MongooseSchema.Types.ObjectId })
  workflowInstanceId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  updatedBy?: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const GrnSchema = SchemaFactory.createForClass(Grn);
GrnSchema.index({ tenantId: 1, grnNumber: 1 }, { unique: true });
GrnSchema.index({ tenantId: 1, purchaseOrderId: 1 });
GrnSchema.index({ tenantId: 1, deliveryId: 1 });
GrnSchema.index({ tenantId: 1, projectId: 1 });
GrnSchema.index({ tenantId: 1, status: 1 });

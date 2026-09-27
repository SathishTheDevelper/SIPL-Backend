import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { DeliveryStatus } from '../enums/delivery.enums';

export type DeliveryDocument = HydratedDocument<Delivery>;

@Schema({ timestamps: true, collection: 'deliveries' })
export class Delivery {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  deliveryNumber!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  purchaseOrderId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  vendorId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  projectId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  siteId!: Types.ObjectId;

  @Prop({ required: true })
  deliveryDate!: Date;

  @Prop({ type: Date })
  expectedDate?: Date;

  @Prop({
    type: String,
    enum: Object.values(DeliveryStatus),
    default: DeliveryStatus.SCHEDULED,
  })
  status!: DeliveryStatus;

  @Prop({ trim: true })
  vehicleNumber?: string;

  @Prop({ trim: true })
  driverName?: string;

  @Prop({ trim: true })
  driverPhone?: string;

  @Prop({ trim: true })
  challanNumber?: string;

  @Prop({ trim: true })
  remarks?: string;

  @Prop({ trim: true })
  cancellationReason?: string;

  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] })
  attachments!: Types.ObjectId[];

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const DeliverySchema = SchemaFactory.createForClass(Delivery);
DeliverySchema.index({ tenantId: 1, deliveryNumber: 1 }, { unique: true });
DeliverySchema.index({ tenantId: 1, purchaseOrderId: 1 });
DeliverySchema.index({ tenantId: 1, status: 1 });

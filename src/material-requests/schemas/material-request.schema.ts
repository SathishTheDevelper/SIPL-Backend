import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  ExceptionStatus,
  MaterialRequestStatus,
} from '../enums/material-request.enums';

export type MaterialRequestDocument = HydratedDocument<MaterialRequest>;

@Schema({ timestamps: true, collection: 'material_requests' })
export class MaterialRequest {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  requestNumber!: string;

  @Prop({ type: Types.ObjectId, required: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  siteId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  boqId!: Types.ObjectId;

  @Prop({ required: true })
  requestDate!: Date;

  @Prop({ required: true })
  requiredDate!: Date;

  @Prop({ type: Types.ObjectId, required: true })
  requestedBy!: Types.ObjectId;

  @Prop({ trim: true })
  remarks?: string;

  @Prop({
    type: String,
    enum: Object.values(MaterialRequestStatus),
    default: MaterialRequestStatus.DRAFT,
  })
  status!: MaterialRequestStatus;

  @Prop({
    type: String,
    enum: Object.values(ExceptionStatus),
    default: ExceptionStatus.NOT_CHECKED,
  })
  exceptionStatus!: ExceptionStatus;

  @Prop({ min: 0, default: 0 })
  exceptionPercentage!: number;

  @Prop({ trim: true })
  exceptionReason?: string;

  @Prop({ trim: true })
  rejectionReason?: string;

  @Prop({ type: Types.ObjectId })
  workflowInstanceId?: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const MaterialRequestSchema =
  SchemaFactory.createForClass(MaterialRequest);
MaterialRequestSchema.index(
  { tenantId: 1, requestNumber: 1 },
  { unique: true },
);
MaterialRequestSchema.index({ tenantId: 1, projectId: 1, status: 1 });
MaterialRequestSchema.index({ tenantId: 1, siteId: 1, status: 1 });
MaterialRequestSchema.index({ tenantId: 1, createdAt: -1 });

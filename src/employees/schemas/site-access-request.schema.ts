import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SiteAccessStatus } from '../enums/employee.enums';

export type SiteAccessRequestDocument = HydratedDocument<SiteAccessRequest>;

@Schema({ timestamps: true, collection: 'site_access_requests' })
export class SiteAccessRequest {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  employeeId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  requestedSiteId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  requestedProjectId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  reason!: string;

  @Prop({ required: true })
  requestedFrom!: Date;

  @Prop({ required: true })
  requestedTo!: Date;

  @Prop({
    type: String,
    enum: Object.values(SiteAccessStatus),
    default: SiteAccessStatus.PENDING,
  })
  status!: SiteAccessStatus;

  @Prop({ type: Types.ObjectId })
  workflowInstanceId?: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  approvedBy?: Types.ObjectId;

  @Prop()
  approvedAt?: Date;

  @Prop()
  rejectedAt?: Date;

  @Prop({ trim: true })
  rejectionReason?: string;

  @Prop({ type: Types.ObjectId })
  assignmentId?: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const SiteAccessRequestSchema =
  SchemaFactory.createForClass(SiteAccessRequest);
SiteAccessRequestSchema.index({ tenantId: 1, employeeId: 1, status: 1 });
SiteAccessRequestSchema.index({ tenantId: 1, requestedSiteId: 1, status: 1 });

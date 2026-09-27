import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PunchType } from '../enums/attendance.enums';

export type AttendancePunchDocument = HydratedDocument<AttendancePunch>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'attendance_punches',
})
export class AttendancePunch {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  employeeId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  siteId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  projectId!: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(PunchType), required: true })
  type!: PunchType;

  @Prop({ required: true })
  latitude!: number;

  @Prop({ required: true })
  longitude!: number;

  @Prop({ required: true, min: 0 })
  distanceFromSite!: number;

  @Prop({ min: 0 })
  accuracy?: number;

  @Prop({ required: true })
  timestamp!: Date;

  @Prop({ type: Object })
  deviceInfo?: Record<string, unknown>;

  @Prop({ required: true, default: false })
  open!: boolean;

  createdAt!: Date;
}

export const AttendancePunchSchema =
  SchemaFactory.createForClass(AttendancePunch);
AttendancePunchSchema.index({ tenantId: 1, employeeId: 1, timestamp: -1 });
AttendancePunchSchema.index({ tenantId: 1, siteId: 1, timestamp: -1 });
AttendancePunchSchema.index(
  { tenantId: 1, employeeId: 1 },
  { unique: true, partialFilterExpression: { open: true, type: PunchType.IN } },
);

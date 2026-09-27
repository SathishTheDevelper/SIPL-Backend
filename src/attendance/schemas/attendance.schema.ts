import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AttendanceStatus } from '../enums/attendance.enums';

export type AttendanceDocument = HydratedDocument<Attendance>;

@Schema({ timestamps: true, collection: 'attendance' })
export class Attendance {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  employeeId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  siteId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  projectId!: Types.ObjectId;

  @Prop({ required: true })
  attendanceDate!: string;

  @Prop()
  firstPunchIn?: Date;

  @Prop()
  lastPunchOut?: Date;

  @Prop({ required: true, min: 0, default: 0 })
  totalWorkedMinutes!: number;

  @Prop({
    type: String,
    enum: Object.values(AttendanceStatus),
    default: AttendanceStatus.PARTIAL,
  })
  status!: AttendanceStatus;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AttendanceSchema = SchemaFactory.createForClass(Attendance);
AttendanceSchema.index(
  { tenantId: 1, employeeId: 1, siteId: 1, attendanceDate: 1 },
  { unique: true },
);
AttendanceSchema.index({ tenantId: 1, employeeId: 1, attendanceDate: 1 });
AttendanceSchema.index({ tenantId: 1, siteId: 1, attendanceDate: 1 });
AttendanceSchema.index({ tenantId: 1, projectId: 1, attendanceDate: 1 });

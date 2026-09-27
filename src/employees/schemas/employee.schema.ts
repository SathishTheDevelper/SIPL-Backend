import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { EmployeeStatus } from '../enums/employee.enums';

export type EmployeeDocument = HydratedDocument<Employee>;

@Schema({ timestamps: true, collection: 'employees' })
export class Employee {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true, uppercase: true })
  employeeCode!: string;

  @Prop({ type: Types.ObjectId })
  userId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  department?: string;

  @Prop({ trim: true })
  designation?: string;

  @Prop({
    type: String,
    enum: Object.values(EmployeeStatus),
    default: EmployeeStatus.ACTIVE,
  })
  status!: EmployeeStatus;

  @Prop()
  joiningDate?: Date;

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;

  createdAt!: Date;
  updatedAt!: Date;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);
EmployeeSchema.index({ tenantId: 1, employeeCode: 1 }, { unique: true });
EmployeeSchema.index(
  { tenantId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $exists: true } } },
);
EmployeeSchema.index({ tenantId: 1, status: 1 });

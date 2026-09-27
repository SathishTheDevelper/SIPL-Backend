import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AssignmentStatus } from '../enums/employee.enums';

export type EmployeeSiteAssignmentDocument =
  HydratedDocument<EmployeeSiteAssignment>;

@Schema({ timestamps: true, collection: 'employee_site_assignments' })
export class EmployeeSiteAssignment {
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
  validFrom!: Date;

  @Prop()
  validTo?: Date;

  @Prop({
    type: String,
    enum: Object.values(AssignmentStatus),
    default: AssignmentStatus.ACTIVE,
  })
  status!: AssignmentStatus;

  @Prop({ type: Types.ObjectId, required: true })
  assignedBy!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const EmployeeSiteAssignmentSchema = SchemaFactory.createForClass(
  EmployeeSiteAssignment,
);
EmployeeSiteAssignmentSchema.index({ tenantId: 1, employeeId: 1, status: 1 });
EmployeeSiteAssignmentSchema.index({ tenantId: 1, siteId: 1, status: 1 });
EmployeeSiteAssignmentSchema.index({ tenantId: 1, projectId: 1, status: 1 });
EmployeeSiteAssignmentSchema.index(
  { tenantId: 1, employeeId: 1, siteId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: AssignmentStatus.ACTIVE },
  },
);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ProjectMemberRole, ProjectMemberStatus } from '../enums/project.enums';

export type ProjectMemberDocument = HydratedDocument<ProjectMember>;

@Schema({ timestamps: true, collection: 'project_members' })
export class ProjectMember {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Project' })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(ProjectMemberRole),
    required: true,
  })
  role!: ProjectMemberRole;

  @Prop({ default: false })
  isPrimary!: boolean;

  @Prop({ type: Date, default: Date.now })
  assignedAt!: Date;

  @Prop({ type: Date })
  removedAt?: Date;

  @Prop({
    type: String,
    enum: Object.values(ProjectMemberStatus),
    default: ProjectMemberStatus.ACTIVE,
  })
  status!: ProjectMemberStatus;
}

export const ProjectMemberSchema = SchemaFactory.createForClass(ProjectMember);
ProjectMemberSchema.index({ tenantId: 1, projectId: 1, userId: 1 });
ProjectMemberSchema.index({ tenantId: 1, projectId: 1, status: 1 });

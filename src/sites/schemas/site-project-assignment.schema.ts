import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SiteProjectAssignmentDocument =
  HydratedDocument<SiteProjectAssignment>;

@Schema({ timestamps: true, collection: 'site_project_assignments' })
export class SiteProjectAssignment {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Site' })
  siteId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Project' })
  projectId!: Types.ObjectId;

  @Prop({ default: true })
  isPrimary!: boolean;
}

export const SiteProjectAssignmentSchema = SchemaFactory.createForClass(
  SiteProjectAssignment,
);
SiteProjectAssignmentSchema.index(
  { tenantId: 1, siteId: 1, projectId: 1 },
  { unique: true },
);

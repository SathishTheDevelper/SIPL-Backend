import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ProjectType } from '../../business-development/requirements/enums/requirement.enums';
import { ProjectStatus } from '../enums/project.enums';

export type ProjectDocument = HydratedDocument<Project>;

@Schema({ timestamps: true, collection: 'projects' })
export class Project {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  projectNumber!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  clientName!: string;

  @Prop({ type: Types.ObjectId })
  clientId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Tender' })
  tenderId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Opportunity' })
  opportunityId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Quotation' })
  quotationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'ClientDecision' })
  clientDecisionId!: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(ProjectType), required: true })
  projectType!: ProjectType;

  @Prop({ trim: true })
  description?: string;

  @Prop({ trim: true })
  location?: string;

  @Prop({ type: Date })
  startDate?: Date;

  @Prop({ type: Date })
  expectedEndDate?: Date;

  @Prop({ type: Date })
  actualEndDate?: Date;

  @Prop({ type: Date })
  plannedStartDate?: Date;

  @Prop({ type: Date })
  plannedEndDate?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  projectHead?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  projectManager?: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(ProjectStatus),
    default: ProjectStatus.PLANNING,
  })
  status!: ProjectStatus;

  @Prop({ min: 0 })
  budget?: number;

  @Prop({ required: true, default: 'INR' })
  currency!: string;

  @Prop({ trim: true })
  remarks?: string;

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
ProjectSchema.index({ tenantId: 1, projectNumber: 1 }, { unique: true });
ProjectSchema.index({ tenantId: 1, quotationId: 1 }, { unique: true });
ProjectSchema.index({ tenantId: 1, status: 1 });
ProjectSchema.index({ tenantId: 1, projectType: 1 });
ProjectSchema.index({ tenantId: 1, clientDecisionId: 1 }, { unique: true });

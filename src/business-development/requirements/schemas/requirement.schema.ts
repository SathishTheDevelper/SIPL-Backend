import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ProjectType, RequirementStatus } from '../enums/requirement.enums';

export type RequirementDocument = HydratedDocument<Requirement>;

@Schema({ _id: true })
export class RequirementItem {
  _id!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  description!: string;

  @Prop({ trim: true })
  category?: string;

  @Prop({ trim: true })
  unit?: string;

  @Prop({ required: true, min: 0 })
  quantity!: number;

  @Prop({ min: 0, default: 0 })
  estimatedRate!: number;

  @Prop({ min: 0, default: 0 })
  estimatedAmount!: number;

  @Prop({ trim: true })
  specification?: string;

  @Prop({ trim: true })
  remarks?: string;

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;
}

@Schema({ timestamps: true, collection: 'requirements' })
export class Requirement {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Tender' })
  tenderId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Opportunity' })
  opportunityId?: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(ProjectType), required: true })
  projectType!: ProjectType;

  @Prop({ trim: true })
  description?: string;

  @Prop({ trim: true })
  location?: string;

  @Prop({ type: Date })
  expectedStartDate?: Date;

  @Prop({ type: Date })
  expectedEndDate?: Date;

  @Prop({ type: [RequirementItem], default: [] })
  items!: RequirementItem[];

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;

  @Prop({
    type: String,
    enum: Object.values(RequirementStatus),
    default: RequirementStatus.DRAFT,
  })
  status!: RequirementStatus;

  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;
}

export const RequirementSchema = SchemaFactory.createForClass(Requirement);
RequirementSchema.index({ tenantId: 1, tenderId: 1 });
RequirementSchema.index({ tenantId: 1, status: 1 });

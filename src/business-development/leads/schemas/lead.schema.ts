import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { LeadStatus } from '../enums/lead-status.enum';

export type LeadDocument = HydratedDocument<Lead>;

@Schema({ timestamps: true, collection: 'leads' })
export class Lead {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  leadNumber!: string;

  @Prop({ required: true, trim: true })
  companyName!: string;

  @Prop({ required: true, trim: true })
  contactPerson!: string;

  @Prop({ lowercase: true, trim: true })
  email?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  source?: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({
    type: String,
    enum: Object.values(LeadStatus),
    default: LeadStatus.NEW,
  })
  status!: LeadStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedTo?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  owner?: Types.ObjectId;

  @Prop({ min: 0 })
  estimatedValue?: number;

  @Prop({ type: Date })
  expectedCloseDate?: Date;

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);
LeadSchema.index({ tenantId: 1, leadNumber: 1 }, { unique: true });
LeadSchema.index({ tenantId: 1, status: 1 });
LeadSchema.index({ tenantId: 1, owner: 1 });
LeadSchema.index({ tenantId: 1, createdAt: -1 });

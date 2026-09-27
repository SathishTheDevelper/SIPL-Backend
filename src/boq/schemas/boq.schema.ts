import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BoqStatus } from '../enums/boq.enums';

export type BoqDocument = HydratedDocument<Boq>;

@Schema({ timestamps: true, collection: 'boqs' })
export class Boq {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  projectId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  boqNumber!: string;

  @Prop({ required: true, min: 1 })
  version!: number;

  @Prop({
    type: String,
    enum: Object.values(BoqStatus),
    default: BoqStatus.DRAFT,
  })
  status!: BoqStatus;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, min: 0, default: 0 })
  totalAmount!: number;

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;

  @Prop()
  approvedAt?: Date;

  @Prop({ type: Types.ObjectId })
  approvedBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  workflowInstanceId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  revisedFromId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const BoqSchema = SchemaFactory.createForClass(Boq);
BoqSchema.index({ tenantId: 1, projectId: 1, version: 1 }, { unique: true });
BoqSchema.index({ tenantId: 1, projectId: 1, status: 1 });
BoqSchema.index({ tenantId: 1, boqNumber: 1 }, { unique: true });

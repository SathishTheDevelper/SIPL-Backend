import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BoqStatus } from '../enums/boq.enums';

export type BoqVersionDocument = HydratedDocument<BoqVersion>;

@Schema({ timestamps: true, collection: 'boq_versions' })
export class BoqVersion {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  boqId!: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  version!: number;

  @Prop({ type: String, enum: Object.values(BoqStatus), required: true })
  status!: BoqStatus;

  @Prop({ type: Types.ObjectId })
  supersededBy?: Types.ObjectId;
}

export const BoqVersionSchema = SchemaFactory.createForClass(BoqVersion);
BoqVersionSchema.index(
  { tenantId: 1, projectId: 1, version: 1 },
  { unique: true },
);
BoqVersionSchema.index({ tenantId: 1, boqId: 1 }, { unique: true });

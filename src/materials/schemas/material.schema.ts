import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { MasterStatus } from '../enums/material.enums';

export type MaterialDocument = HydratedDocument<Material>;

@Schema({ timestamps: true, collection: 'materials' })
export class Material {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true, uppercase: true })
  materialCode!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: Types.ObjectId, required: true })
  categoryId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  unitId!: Types.ObjectId;

  @Prop({ required: true, min: 0, default: 0 })
  defaultRate!: number;

  @Prop({ required: true, min: 0, default: 0 })
  taxRate!: number;

  @Prop({
    type: String,
    enum: Object.values(MasterStatus),
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;
}

export const MaterialSchema = SchemaFactory.createForClass(Material);
MaterialSchema.index({ tenantId: 1, materialCode: 1 }, { unique: true });
MaterialSchema.index({ tenantId: 1, status: 1 });
MaterialSchema.index({ tenantId: 1, categoryId: 1 });

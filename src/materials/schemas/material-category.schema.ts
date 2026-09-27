import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { MasterStatus } from '../enums/material.enums';

export type MaterialCategoryDocument = HydratedDocument<MaterialCategory>;

@Schema({ timestamps: true, collection: 'material_categories' })
export class MaterialCategory {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({
    type: String,
    enum: Object.values(MasterStatus),
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;
}

export const MaterialCategorySchema =
  SchemaFactory.createForClass(MaterialCategory);
MaterialCategorySchema.index({ tenantId: 1, code: 1 }, { unique: true });
MaterialCategorySchema.index({ tenantId: 1, status: 1 });

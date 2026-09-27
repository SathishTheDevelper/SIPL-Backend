import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MaterialRequestItemDocument = HydratedDocument<MaterialRequestItem>;

@Schema({ timestamps: true, collection: 'material_request_items' })
export class MaterialRequestItem {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  materialRequestId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  siteId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  boqId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  boqItemId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  materialId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  unitId!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  boqQuantity!: number;

  @Prop({ required: true, min: 0, default: 0 })
  previouslyApprovedQuantity!: number;

  @Prop({ required: true, min: 0 })
  currentRequestQuantity!: number;

  @Prop({ required: true, min: 0, default: 0 })
  cumulativeQuantity!: number;

  @Prop({ required: true, min: 0, default: 0 })
  increasePercentage!: number;

  @Prop({ trim: true })
  remarks?: string;

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;
}

export const MaterialRequestItemSchema =
  SchemaFactory.createForClass(MaterialRequestItem);
MaterialRequestItemSchema.index({ tenantId: 1, materialRequestId: 1 });
MaterialRequestItemSchema.index({ tenantId: 1, boqItemId: 1 });

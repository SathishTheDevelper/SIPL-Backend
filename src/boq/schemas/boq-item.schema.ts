import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type BoqItemDocument = HydratedDocument<BoqItem>;

@Schema({ timestamps: true, collection: 'boq_items' })
export class BoqItem {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  boqId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  projectId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  materialId!: Types.ObjectId;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  categoryId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  unitId!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  rate!: number;

  @Prop({ required: true, min: 0 })
  amount!: number;

  @Prop({ trim: true })
  remarks?: string;

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;
}

export const BoqItemSchema = SchemaFactory.createForClass(BoqItem);
BoqItemSchema.index({ tenantId: 1, boqId: 1 });
BoqItemSchema.index({ tenantId: 1, projectId: 1, materialId: 1 });

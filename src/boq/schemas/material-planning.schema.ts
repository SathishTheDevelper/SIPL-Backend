import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PlanningStatus } from '../enums/boq.enums';

export type MaterialPlanningDocument = HydratedDocument<MaterialPlanning>;

@Schema({ timestamps: true, collection: 'material_plannings' })
export class MaterialPlanning {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  projectId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  boqId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  boqItemId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  materialId!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  plannedQuantity!: number;

  @Prop({ required: true })
  plannedDate!: Date;

  @Prop({
    type: String,
    enum: Object.values(PlanningStatus),
    default: PlanningStatus.PLANNED,
  })
  status!: PlanningStatus;

  @Prop({ trim: true })
  remarks?: string;

  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const MaterialPlanningSchema =
  SchemaFactory.createForClass(MaterialPlanning);
MaterialPlanningSchema.index({ tenantId: 1, projectId: 1, status: 1 });
MaterialPlanningSchema.index({ tenantId: 1, boqItemId: 1 });

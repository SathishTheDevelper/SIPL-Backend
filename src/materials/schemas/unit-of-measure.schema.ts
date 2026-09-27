import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { MasterStatus } from '../enums/material.enums';

export type UnitOfMeasureDocument = HydratedDocument<UnitOfMeasure>;

@Schema({ timestamps: true, collection: 'units_of_measure' })
export class UnitOfMeasure {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  symbol!: string;

  @Prop({
    type: String,
    enum: Object.values(MasterStatus),
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;
}

export const UnitOfMeasureSchema = SchemaFactory.createForClass(UnitOfMeasure);
UnitOfMeasureSchema.index({ tenantId: 1, code: 1 }, { unique: true });
UnitOfMeasureSchema.index({ tenantId: 1, status: 1 });

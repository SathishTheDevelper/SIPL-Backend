import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SlaConfigurationDocument = HydratedDocument<SlaConfiguration>;

@Schema({ timestamps: true, collection: 'sla_configurations' })
export class SlaConfiguration {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, uppercase: true, trim: true })
  module!: string;

  @Prop({ required: true, min: 0.25 })
  hours!: number;

  @Prop({ type: Types.ObjectId, ref: 'BusinessCalendar' })
  calendarId?: Types.ObjectId;

  @Prop({ trim: true })
  escalateToRole?: string;

  @Prop({ type: Types.ObjectId })
  escalateToUser?: Types.ObjectId;
}

export const SlaConfigurationSchema =
  SchemaFactory.createForClass(SlaConfiguration);

SlaConfigurationSchema.index({ tenantId: 1, module: 1 }, { unique: true });

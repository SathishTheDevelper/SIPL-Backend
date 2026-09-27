import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type HolidayDocument = HydratedDocument<Holiday>;

@Schema({ timestamps: true, collection: 'holidays' })
export class Holiday {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'BusinessCalendar' })
  calendarId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  date!: string;

  @Prop({ required: true, trim: true })
  name!: string;
}

export const HolidaySchema = SchemaFactory.createForClass(Holiday);

HolidaySchema.index({ tenantId: 1, calendarId: 1, date: 1 }, { unique: true });

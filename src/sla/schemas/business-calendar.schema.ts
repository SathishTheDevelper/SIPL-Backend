import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BusinessCalendarDocument = HydratedDocument<BusinessCalendar>;

@Schema({ timestamps: true, collection: 'business_calendars' })
export class BusinessCalendar {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, default: 'Asia/Kolkata' })
  timezone!: string;

  @Prop({ type: [Number], default: [1, 2, 3, 4, 5] })
  workingDays!: number[];

  @Prop({ required: true, default: '09:00' })
  workingStartTime!: string;

  @Prop({ required: true, default: '18:00' })
  workingEndTime!: string;

  @Prop({ default: true })
  isDefault!: boolean;
}

export const BusinessCalendarSchema =
  SchemaFactory.createForClass(BusinessCalendar);

BusinessCalendarSchema.index({ tenantId: 1, isDefault: 1 });
BusinessCalendarSchema.index({ tenantId: 1, name: 1 }, { unique: true });

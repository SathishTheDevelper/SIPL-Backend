import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { NotificationChannel } from '../enums/notification.enums';

export type NotificationPreferenceDocument =
  HydratedDocument<NotificationPreference>;

@Schema({ timestamps: true, collection: 'notification_preferences' })
export class NotificationPreference {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  eventType!: string;

  @Prop({
    type: [String],
    enum: Object.values(NotificationChannel),
    default: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  })
  channels!: NotificationChannel[];

  @Prop({ default: true })
  enabled!: boolean;
}

export const NotificationPreferenceSchema = SchemaFactory.createForClass(
  NotificationPreference,
);

NotificationPreferenceSchema.index(
  { tenantId: 1, userId: 1, eventType: 1 },
  { unique: true },
);

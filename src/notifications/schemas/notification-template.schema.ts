import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { NotificationChannel } from '../enums/notification.enums';

export type NotificationTemplateDocument =
  HydratedDocument<NotificationTemplate>;

@Schema({ timestamps: true, collection: 'notification_templates' })
export class NotificationTemplate {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  tenantId!: Types.ObjectId | null;

  @Prop({ required: true, trim: true })
  code!: string;

  @Prop({
    type: String,
    enum: Object.values(NotificationChannel),
    required: true,
  })
  channel!: NotificationChannel;

  @Prop({ required: true, trim: true })
  subject!: string;

  @Prop({ required: true, trim: true })
  body!: string;
}

export const NotificationTemplateSchema =
  SchemaFactory.createForClass(NotificationTemplate);

NotificationTemplateSchema.index(
  { tenantId: 1, code: 1, channel: 1 },
  { unique: true },
);

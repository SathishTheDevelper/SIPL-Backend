import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QUEUE_NOTIFICATIONS } from '../common/constants/queues';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationProcessor } from './processors/notification.processor';
import {
  NotificationPreference,
  NotificationPreferenceSchema,
} from './schemas/notification-preference.schema';
import {
  NotificationTemplate,
  NotificationTemplateSchema,
} from './schemas/notification-template.schema';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import { NotificationsService } from './services/notifications.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: NotificationTemplate.name, schema: NotificationTemplateSchema },
      {
        name: NotificationPreference.name,
        schema: NotificationPreferenceSchema,
      },
    ]),
    MailModule,
    UsersModule,
    ...(process.env.REDIS_MODE === 'memory'
      ? []
      : [BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS })]),
  ],
  controllers: [NotificationsController],
  providers:
    process.env.REDIS_MODE === 'memory'
      ? [NotificationsService]
      : [NotificationsService, NotificationProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}

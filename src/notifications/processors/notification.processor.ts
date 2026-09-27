import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  NOTIFICATION_JOB_SEND,
  QUEUE_NOTIFICATIONS,
} from '../../common/constants/queues';
import {
  NotificationsService,
  NotifyInput,
} from '../services/notifications.service';

@Processor(QUEUE_NOTIFICATIONS)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly notificationsService: NotificationsService) {
    super();
  }

  async process(job: Job<NotifyInput>): Promise<void> {
    if (job.name !== NOTIFICATION_JOB_SEND) {
      this.logger.warn(`Unknown notification job ${job.name}`);
      return;
    }
    await this.notificationsService.deliver(job.data);
  }
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  MAIL_JOB_PASSWORD_RESET,
  QUEUE_MAIL,
} from '../common/constants/queues';
import { MailService, PasswordResetMail } from './mail.service';

@Processor(QUEUE_MAIL)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(job: Job<PasswordResetMail>): Promise<void> {
    if (job.name !== MAIL_JOB_PASSWORD_RESET) {
      this.logger.warn(`Unknown mail job ${job.name}`);
      return;
    }
    await this.mailService.sendPasswordReset(job.data);
  }
}

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_MAIL } from '../common/constants/queues';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';

const redisMode = process.env.REDIS_MODE === 'memory';

@Module({
  imports: redisMode ? [] : [BullModule.registerQueue({ name: QUEUE_MAIL })],
  providers: redisMode ? [MailService] : [MailService, MailProcessor],
  exports: [MailService],
})
export class MailModule {}

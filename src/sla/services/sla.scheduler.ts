import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_SLA, SLA_JOB_SCAN } from '../../common/constants/queues';

@Injectable()
export class SlaScheduler implements OnModuleInit {
  constructor(@InjectQueue(QUEUE_SLA) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      SLA_JOB_SCAN,
      {},
      { repeat: { every: 60_000 }, jobId: 'sla-scan' },
    );
  }
}

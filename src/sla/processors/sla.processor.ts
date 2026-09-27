import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_SLA, SLA_JOB_SCAN } from '../../common/constants/queues';
import { SlaService } from '../services/sla.service';

@Processor(QUEUE_SLA)
export class SlaProcessor extends WorkerHost {
  private readonly logger = new Logger(SlaProcessor.name);

  constructor(private readonly slaService: SlaService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== SLA_JOB_SCAN) {
      return;
    }
    const count = await this.slaService.checkDueInstances();
    if (count > 0) {
      this.logger.log(`Processed ${count} SLA breach(es)`);
    }
  }
}

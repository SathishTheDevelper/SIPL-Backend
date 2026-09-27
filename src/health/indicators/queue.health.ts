import { Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class QueueHealthIndicator extends HealthIndicator {
  constructor(private readonly redis: RedisService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    if (this.redis.mode === 'memory') {
      return this.getStatus(key, true, { mode: 'memory', skipped: true });
    }

    try {
      const client = this.redis.getRawClient();
      if (!client) {
        throw new Error('Queue connection is not initialized');
      }
      await client.ping();
      return this.getStatus(key, true, { mode: 'bullmq' });
    } catch (error) {
      throw new HealthCheckError(
        'Queue check failed',
        this.getStatus(key, false, {
          message: error instanceof Error ? error.message : 'unknown',
        }),
      );
    }
  }
}

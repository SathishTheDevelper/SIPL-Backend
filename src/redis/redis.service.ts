import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

interface MemoryEntry {
  value: string;
  expiresAt?: number;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private readonly memory = new Map<string, MemoryEntry>();
  private readonly sets = new Map<string, Set<string>>();
  readonly mode: 'redis' | 'memory';

  constructor(private readonly configService: ConfigService) {
    this.mode = this.configService.get<'redis' | 'memory'>(
      'redis.mode',
      'redis',
    );
  }

  async onModuleInit(): Promise<void> {
    if (this.mode === 'memory') {
      this.logger.warn('Redis running in in-memory mode (tests/dev only)');
      return;
    }

    this.client = new Redis({
      host: this.configService.get<string>('redis.host'),
      port: this.configService.get<number>('redis.port'),
      password: this.configService.get<string>('redis.password'),
      db: this.configService.get<number>('redis.db'),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis error: ${error.message}`);
    });

    await this.client.connect();
    this.logger.log('Redis connected');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  async ping(): Promise<string> {
    if (this.mode === 'memory') {
      return 'PONG';
    }
    return this.getClient().ping();
  }

  async get(key: string): Promise<string | null> {
    if (this.mode === 'memory') {
      const entry = this.memory.get(key);
      if (!entry) return null;
      if (entry.expiresAt && entry.expiresAt <= Date.now()) {
        this.memory.delete(key);
        return null;
      }
      return entry.value;
    }
    return this.getClient().get(key);
  }

  async setIfAbsent(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (this.mode === 'memory') {
      const current = this.memory.get(key);
      if (current && (!current.expiresAt || current.expiresAt > Date.now())) {
        return false;
      }
      this.memory.set(key, {
        value,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      return true;
    }
    const result = await this.getClient().set(
      key,
      value,
      'EX',
      ttlSeconds,
      'NX',
    );
    return result === 'OK';
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.mode === 'memory') {
      this.memory.set(key, {
        value,
        expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
      });
      return;
    }
    if (ttlSeconds) {
      await this.getClient().set(key, value, 'EX', ttlSeconds);
      return;
    }
    await this.getClient().set(key, value);
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    if (this.mode === 'memory') {
      let removed = 0;
      for (const key of keys) {
        if (this.memory.delete(key) || this.sets.delete(key)) {
          removed += 1;
        }
      }
      return removed;
    }
    return this.getClient().del(...keys);
  }

  async sadd(key: string, member: string): Promise<void> {
    if (this.mode === 'memory') {
      const set = this.sets.get(key) ?? new Set<string>();
      set.add(member);
      this.sets.set(key, set);
      return;
    }
    await this.getClient().sadd(key, member);
  }

  async srem(key: string, member: string): Promise<void> {
    if (this.mode === 'memory') {
      this.sets.get(key)?.delete(member);
      return;
    }
    await this.getClient().srem(key, member);
  }

  async smembers(key: string): Promise<string[]> {
    if (this.mode === 'memory') {
      return Array.from(this.sets.get(key) ?? []);
    }
    return this.getClient().smembers(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (this.mode === 'memory') {
      const entry = this.memory.get(key);
      if (entry) {
        entry.expiresAt = Date.now() + ttlSeconds * 1000;
      }
      return;
    }
    await this.getClient().expire(key, ttlSeconds);
  }

  getRawClient(): Redis | null {
    return this.client;
  }

  private getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client is not initialized');
    }
    return this.client;
  }
}

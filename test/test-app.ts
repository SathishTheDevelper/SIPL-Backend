import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { AppModule } from '../src/app.module';

let replset: MongoMemoryReplSet | undefined;

function ensureCacheDirs(): void {
  const cacheRoot = join(process.cwd(), '.cache');
  const downloadDir = join(cacheRoot, 'mongodb-binaries');
  if (!existsSync(downloadDir)) {
    mkdirSync(downloadDir, { recursive: true });
  }
  process.env.MONGOMS_DOWNLOAD_DIR = downloadDir;
  process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION ?? '7.0.14';
}

export async function createTestingApp(): Promise<INestApplication> {
  ensureCacheDirs();
  if (!replset) {
    replset = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
  }
  process.env.MONGODB_URI = replset.getUri('sipl_e2e');
  process.env.REDIS_MODE = 'memory';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-16chars';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-16ch';
  process.env.BCRYPT_ROUNDS = '4';
  process.env.THROTTLE_LIMIT = '10000';
  process.env.THROTTLE_LOGIN_LIMIT = '1000';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

export async function stopTestingMongo(): Promise<void> {
  if (replset) {
    await replset.stop();
    replset = undefined;
  }
}

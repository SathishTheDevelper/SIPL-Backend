import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestingApp, stopTestingMongo } from './test-app';

describe('Health (e2e)', () => {
  let app: INestApplication;
  let http: App;

  beforeAll(async () => {
    app = await createTestingApp();
    http = app.getHttpServer() as App;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await stopTestingMongo();
  });

  it('reports liveness without authentication', async () => {
    const response = await request(http)
      .get('/api/v1/health/liveness')
      .expect(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('ok');
  });
});

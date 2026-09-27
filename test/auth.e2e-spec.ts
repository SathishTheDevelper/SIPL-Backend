import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DEMO_PASSWORD, runSeed } from '../src/database/seed/seed';
import { createTestingApp, stopTestingMongo } from './test-app';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let http: App;

  beforeAll(async () => {
    app = await createTestingApp();
    http = app.getHttpServer() as App;
    await runSeed({ disconnect: false });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await stopTestingMongo();
  });

  it('rejects invalid credentials with a generic message', async () => {
    const response = await request(http)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin.a@tenant-a.local',
        password: 'WrongPass@12345',
        tenantCode: 'TENANTA',
      })
      .expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.errorCode).toBe('INVALID_CREDENTIALS');
  });

  it('logs in a tenant user and returns tokens', async () => {
    const response = await request(http)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin.a@tenant-a.local',
        password: DEMO_PASSWORD,
        tenantCode: 'TENANTA',
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.refreshToken).toBeDefined();
    expect(response.body.data.user.email).toBe('admin.a@tenant-a.local');
  });

  it('returns the current user from /auth/me', async () => {
    const login = await request(http).post('/api/v1/auth/login').send({
      email: 'admin.a@tenant-a.local',
      password: DEMO_PASSWORD,
      tenantCode: 'TENANTA',
    });

    const me = await request(http)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(200);

    expect(me.body.data.email).toBe('admin.a@tenant-a.local');
    expect(me.body.data.role).toBe('TENANT_ADMIN');
  });

  it('refreshes tokens and rejects the previous refresh token', async () => {
    const login = await request(http).post('/api/v1/auth/login').send({
      email: 'admin.a@tenant-a.local',
      password: DEMO_PASSWORD,
      tenantCode: 'TENANTA',
    });

    const refresh = await request(http)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.data.refreshToken })
      .expect(201);

    expect(refresh.body.data.accessToken).toBeDefined();

    await request(http)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.data.refreshToken })
      .expect(401);
  });

  it('logs in the platform super admin without a tenant code', async () => {
    const response = await request(http)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@sipl.local',
        password: 'SuperAdmin@12345',
      })
      .expect(201);

    expect(response.body.data.user.role).toBe('SUPER_ADMIN');
    expect(response.body.data.user.tenantId).toBeNull();
  });
});

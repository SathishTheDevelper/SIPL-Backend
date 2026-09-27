import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DEMO_PASSWORD, runSeed } from '../src/database/seed/seed';
import { createTestingApp, stopTestingMongo } from './test-app';

describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let http: App;
  let tokenA: string;
  let tokenB: string;
  let userIdB: string;

  beforeAll(async () => {
    app = await createTestingApp();
    http = app.getHttpServer() as App;
    await runSeed({ disconnect: false });

    const loginA = await request(http).post('/api/v1/auth/login').send({
      email: 'admin.a@tenant-a.local',
      password: DEMO_PASSWORD,
      tenantCode: 'TENANTA',
    });
    const loginB = await request(http).post('/api/v1/auth/login').send({
      email: 'admin.b@tenant-b.local',
      password: DEMO_PASSWORD,
      tenantCode: 'TENANTB',
    });
    tokenA = loginA.body.data.accessToken;
    tokenB = loginB.body.data.accessToken;

    const usersB = await request(http)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    userIdB = String(usersB.body.data[0].id ?? usersB.body.data[0]._id);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await stopTestingMongo();
  });

  it('lists only the current tenant users', async () => {
    const usersA = await request(http)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const emails = usersA.body.data.map(
      (user: { email: string }) => user.email,
    );
    expect(emails.every((email: string) => email.includes('tenant-a'))).toBe(
      true,
    );
    expect(emails.some((email: string) => email.includes('tenant-b'))).toBe(
      false,
    );
  });

  it('returns 404 when Tenant A requests a Tenant B user id', async () => {
    const response = await request(http)
      .get(`/api/v1/users/${userIdB}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.errorCode).toBe('NOT_FOUND');
  });

  it('ignores tenantId smuggled in the request body', async () => {
    const roles = await request(http)
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${tokenA}`);
    const employeeRole = roles.body.data.find(
      (role: { code: string }) => role.code === 'EMPLOYEE',
    );

    const created = await request(http)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        email: 'smuggle@tenant-a.local',
        password: 'Smuggle@12345',
        firstName: 'No',
        lastName: 'Leak',
        roleId: employeeRole._id,
        tenantId: '000000000000000000000000',
      })
      .expect(400);

    expect(created.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('does not allow Tenant A to list Tenant B roles', async () => {
    const rolesA = await request(http)
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const rolesB = await request(http)
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    const idA = new Set(
      rolesA.body.data.map((role: { _id: string }) => String(role._id)),
    );
    const overlap = rolesB.body.data.some((role: { _id: string }) =>
      idA.has(String(role._id)),
    );
    expect(overlap).toBe(false);
  });
});

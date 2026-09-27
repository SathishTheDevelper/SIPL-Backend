import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DEMO_PASSWORD, runSeed } from '../src/database/seed/seed';
import { createTestingApp, stopTestingMongo } from './test-app';

describe('Phase 2 (e2e)', () => {
  let app: INestApplication;
  let http: App;
  let tokenA: string;
  let tokenB: string;
  let projectHeadA: string;

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
    const loginHead = await request(http).post('/api/v1/auth/login').send({
      email: 'projecthead.a@tenant-a.local',
      password: DEMO_PASSWORD,
      tenantCode: 'TENANTA',
    });
    tokenA = loginA.body.data.accessToken;
    tokenB = loginB.body.data.accessToken;
    projectHeadA = loginHead.body.data.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await stopTestingMongo();
  });

  it('keeps custom field definitions tenant-scoped', async () => {
    const fieldsA = await request(http)
      .get('/api/v1/custom-fields/PROJECT')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const fieldsB = await request(http)
      .get('/api/v1/custom-fields/PROJECT')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    const keysA = fieldsA.body.data.map((item: { key: string }) => item.key);
    const keysB = fieldsB.body.data.map((item: { key: string }) => item.key);
    expect(keysA).toContain('site_soil_type');
    expect(keysB).toContain('interior_style');
    expect(keysA).not.toContain('interior_style');
    expect(keysB).not.toContain('site_soil_type');

    await request(http)
      .patch(`/api/v1/custom-fields/${fieldsB.body.data[0]._id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ label: 'stolen' })
      .expect(404);
  });

  it('allocates unique numbers per tenant', async () => {
    const first = await request(http)
      .post('/api/v1/numbering/next')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ documentType: 'LEAD' })
      .expect(201);
    const second = await request(http)
      .post('/api/v1/numbering/next')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ documentType: 'LEAD' })
      .expect(201);
    const otherTenant = await request(http)
      .post('/api/v1/numbering/next')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ documentType: 'LEAD' })
      .expect(201);

    expect(first.body.data.number).not.toBe(second.body.data.number);
    expect(first.body.data.sequence).toBe(1);
    expect(second.body.data.sequence).toBe(2);
    expect(otherTenant.body.data.sequence).toBe(1);
  });

  it('requires a reason for workflow REJECT and SEND_BACK', async () => {
    const started = await request(http)
      .post('/api/v1/workflows/instances')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        module: 'MATERIAL_APPROVAL',
        entityType: 'MaterialRequest',
        entityId: 'mr-reject-1',
        context: {},
      })
      .expect(201);

    await request(http)
      .post(`/api/v1/workflows/instances/${started.body.data._id}/actions`)
      .set('Authorization', `Bearer ${projectHeadA}`)
      .send({ action: 'REJECT' })
      .expect(400);

    await request(http)
      .post(`/api/v1/workflows/instances/${started.body.data._id}/actions`)
      .set('Authorization', `Bearer ${projectHeadA}`)
      .send({ action: 'SEND_BACK' })
      .expect(400);

    const rejected = await request(http)
      .post(`/api/v1/workflows/instances/${started.body.data._id}/actions`)
      .set('Authorization', `Bearer ${projectHeadA}`)
      .send({ action: 'REJECT', reason: 'BOQ exceeded' })
      .expect(201);
    expect(rejected.body.data.status).toBe('REJECTED');
  });

  it('lets the backend-resolved project head approve', async () => {
    const started = await request(http)
      .post('/api/v1/workflows/instances')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        module: 'MATERIAL_APPROVAL',
        entityType: 'MaterialRequest',
        entityId: 'mr-approve-1',
      })
      .expect(201);

    const employeeLogin = await request(http).post('/api/v1/auth/login').send({
      email: 'employee.a@tenant-a.local',
      password: 'Employee@12345',
      tenantCode: 'TENANTA',
    });

    await request(http)
      .post(`/api/v1/workflows/instances/${started.body.data._id}/actions`)
      .set('Authorization', `Bearer ${employeeLogin.body.data.accessToken}`)
      .send({ action: 'APPROVE' })
      .expect(403);

    const approved = await request(http)
      .post(`/api/v1/workflows/instances/${started.body.data._id}/actions`)
      .set('Authorization', `Bearer ${projectHeadA}`)
      .send({ action: 'APPROVE' })
      .expect(201);
    expect(approved.body.data.status).toBe('APPROVED');
  });

  it('rejects audit log mutations', async () => {
    const logs = await request(http)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(Array.isArray(logs.body.data)).toBe(true);

    if (logs.body.data[0]) {
      await request(http)
        .patch(`/api/v1/audit-logs/${logs.body.data[0]._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({})
        .expect(403);
    }
  });

  it('does not return Tenant B workflow definitions to Tenant A', async () => {
    const defsA = await request(http)
      .get('/api/v1/workflows/definitions')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const defsB = await request(http)
      .get('/api/v1/workflows/definitions')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    const idsA = new Set(
      defsA.body.data.map((item: { _id: string }) => String(item._id)),
    );
    const overlap = defsB.body.data.some((item: { _id: string }) =>
      idsA.has(String(item._id)),
    );
    expect(overlap).toBe(false);
  });
});

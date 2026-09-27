import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  DEMO_PASSWORD,
  EMPLOYEE_PASSWORD,
  runSeed,
} from '../src/database/seed/seed';
import { createTestingApp, stopTestingMongo } from './test-app';

const SITE = { latitude: 13.0827, longitude: 80.2707 };

function northOf(meters: number) {
  return {
    latitude: SITE.latitude + meters / 111_320,
    longitude: SITE.longitude,
  };
}

describe('Phase 4 (e2e)', () => {
  let app: INestApplication;
  let http: App;
  let tokenA: string;
  let tokenB: string;
  let head: string;
  let md: string;
  let director: string;
  let hr: string;
  let employeeToken: string;
  let engineer: string;
  let employeeUserId: string;
  let projectId: string;
  let siteA: string;
  let siteB: string;
  let siteC: string;
  let siteD: string;
  let materialId: string;
  let categoryId: string;
  let unitId: string;
  let boqId: string;
  let boqItemId: string;
  let employeeId: string;

  beforeAll(async () => {
    app = await createTestingApp();
    http = app.getHttpServer() as App;
    await runSeed({ disconnect: false });

    const login = async (
      email: string,
      password = DEMO_PASSWORD,
      tenantCode = 'TENANTA',
    ) => {
      const res = await request(http)
        .post('/api/v1/auth/login')
        .send({ email, password, tenantCode })
        .expect(201);
      return res.body.data as { accessToken: string; user: { id: string } };
    };
    const admin = await login('admin.a@tenant-a.local');
    const other = await login(
      'admin.b@tenant-b.local',
      DEMO_PASSWORD,
      'TENANTB',
    );
    tokenB = other.accessToken;
    tokenA = admin.accessToken;
    head = (await login('projecthead.a@tenant-a.local')).accessToken;
    md = (await login('md.a@tenant-a.local')).accessToken;
    director = (await login('director.a@tenant-a.local')).accessToken;
    hr = (await login('hr.a@tenant-a.local')).accessToken;
    engineer = (await login('siteengineer.a@tenant-a.local')).accessToken;
    const employee = await login(
      'employee.a@tenant-a.local',
      EMPLOYEE_PASSWORD,
    );
    employeeToken = employee.accessToken;
    employeeUserId = employee.user.id;

    projectId = await winProject(tokenA);
    siteA = await makeSite(tokenA, projectId, 'SITE-A', 100);
    siteB = await makeSite(tokenA, projectId, 'SITE-B', 250);
    siteC = await makeSite(tokenA, projectId, 'SITE-C', 500);
    siteD = await makeSite(tokenA, projectId, 'SITE-D', 100);

    const category = await request(http)
      .post('/api/v1/material-categories')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'CEMENT', name: 'Cement' })
      .expect(201);
    const unit = await request(http)
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'BAG', name: 'Bag', symbol: 'bag' })
      .expect(201);
    const material = await request(http)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        materialCode: 'CEM-53',
        name: 'OPC 53',
        categoryId: category.body.data._id,
        unitId: unit.body.data._id,
        defaultRate: 400,
      })
      .expect(201);
    materialId = material.body.data._id;
    categoryId = category.body.data._id;
    unitId = unit.body.data._id;

    const boq = await request(http)
      .post(`/api/v1/projects/${projectId}/boq`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ description: 'Version 1' })
      .expect(201);
    const item = await request(http)
      .post(`/api/v1/boq/${boq.body.data._id}/items`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ materialId, quantity: 100, rate: 10 })
      .expect(201);
    expect(item.body.data.amount).toBe(1000);
    await request(http)
      .post(`/api/v1/boq/${boq.body.data._id}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    await request(http)
      .post(`/api/v1/boq/${boq.body.data._id}/approve`)
      .set('Authorization', `Bearer ${head}`)
      .send({})
      .expect(201);

    const revised = await request(http)
      .post(`/api/v1/boq/${boq.body.data._id}/revise`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    expect(revised.body.data.version).toBe(2);
    expect(revised.body.data.status).toBe('DRAFT');
    const original = await request(http)
      .get(`/api/v1/boq/${boq.body.data._id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(original.body.data.status).toBe('APPROVED');

    const copied = await request(http)
      .get(`/api/v1/boq/${revised.body.data._id}/items`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    await request(http)
      .post(`/api/v1/boq/${revised.body.data._id}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    const approved = await request(http)
      .post(`/api/v1/boq/${revised.body.data._id}/approve`)
      .set('Authorization', `Bearer ${head}`)
      .send({})
      .expect(201);
    expect(approved.body.data.status).toBe('APPROVED');
    const superseded = await request(http)
      .get(`/api/v1/boq/${boq.body.data._id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(superseded.body.data.status).toBe('SUPERSEDED');
    boqId = revised.body.data._id as string;
    boqItemId = copied.body.data[0]._id;
    await request(http)
      .post(`/api/v1/projects/${projectId}/material-planning`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        boqId,
        boqItemId,
        plannedQuantity: 100,
        plannedDate: '2026-10-01',
      })
      .expect(201);

    const worker = await request(http)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Site Employee A',
        email: 'employee.a@tenant-a.local',
        userId: employeeUserId,
        department: 'Site',
      })
      .expect(201);
    employeeId = worker.body.data._id;
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000 * 30).toISOString();
    for (const siteId of [siteA, siteB, siteC]) {
      await request(http)
        .post(`/api/v1/employees/${employeeId}/site-assignments`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ siteId, projectId, validFrom: from, validTo: to })
        .expect(201);
    }
  });

  afterAll(async () => {
    if (app) await app.close();
    await stopTestingMongo();
  });

  it('rejects a duplicate material code and hides tenant B records', async () => {
    await request(http)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        materialCode: 'CEM-53',
        name: 'Duplicate',
        categoryId,
        unitId,
      })
      .expect(409);
    await request(http)
      .get(`/api/v1/materials/${materialId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    await request(http)
      .get(`/api/v1/boq/${boqId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    await request(http)
      .get(`/api/v1/employees/${employeeId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    await request(http)
      .get(`/api/v1/sites/${siteA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('paginates material, BOQ, request, employee, and attendance lists', async () => {
    const materials = await request(http)
      .get('/api/v1/materials')
      .query({ limit: 1 })
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(materials.body.data.length).toBeLessThanOrEqual(1);
    expect(materials.body.pagination.limit).toBe(1);
    const boqs = await request(http)
      .get(`/api/v1/projects/${projectId}/boq`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(Array.isArray(boqs.body.data)).toBe(true);
    const employees = await request(http)
      .get('/api/v1/employees')
      .query({ limit: 1 })
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(employees.body.data.length).toBeLessThanOrEqual(1);
    const report = await request(http)
      .get('/api/v1/attendance/reports')
      .query({ limit: 1, projectId })
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(report.body.data.length).toBeLessThanOrEqual(1);
  });

  it('flags a 35% cumulative increase and notifies MD and Director without giving them the approval task', async () => {
    await approveRequest(await draftRequest(20));
    const exception = await submitRequest(await draftRequest(15));
    expect(exception.exceptionStatus).toBe('EXCEPTION');
    expect(exception.exceptionPercentage).toBe(35);

    const mdNotes = await request(http)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${md}`)
      .expect(200);
    expect(
      mdNotes.body.data.some(
        (note: { eventType: string; entityId: string }) =>
          note.eventType === 'MATERIAL_EXCEPTION' &&
          note.entityId === exception._id,
      ),
    ).toBe(true);
    const directorNotes = await request(http)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${director}`)
      .expect(200);
    expect(
      directorNotes.body.data.some(
        (note: { eventType: string; entityId: string }) =>
          note.eventType === 'MATERIAL_EXCEPTION' &&
          note.entityId === exception._id,
      ),
    ).toBe(true);

    const mdInbox = await request(http)
      .get('/api/v1/workflows/inbox')
      .set('Authorization', `Bearer ${md}`)
      .expect(200);
    expect(
      mdInbox.body.data.some(
        (row: { entityId: string }) => row.entityId === exception._id,
      ),
    ).toBe(false);
    const directorInbox = await request(http)
      .get('/api/v1/workflows/inbox')
      .set('Authorization', `Bearer ${director}`)
      .expect(200);
    expect(
      directorInbox.body.data.some(
        (row: { entityId: string }) => row.entityId === exception._id,
      ),
    ).toBe(false);
    const headInbox = await request(http)
      .get('/api/v1/workflows/inbox')
      .set('Authorization', `Bearer ${head}`)
      .expect(200);
    const task = headInbox.body.data.find(
      (row: { entityId: string }) => row.entityId === exception._id,
    );
    expect(task).toBeTruthy();
    expect(task.currentApproverRole).toBe('PROJECT_HEAD');

    await request(http)
      .post(
        `/api/v1/workflows/instances/${exception.workflowInstanceId}/actions`,
      )
      .set('Authorization', `Bearer ${head}`)
      .send({ action: 'REJECT' })
      .expect(400);
    await request(http)
      .post(
        `/api/v1/workflows/instances/${exception.workflowInstanceId}/actions`,
      )
      .set('Authorization', `Bearer ${head}`)
      .send({ action: 'REJECT', reason: 'Quantity is not justified' })
      .expect(201);
    const rejected = await request(http)
      .get(`/api/v1/material-requests/${exception._id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(rejected.body.data.status).toBe('REJECTED');
    expect(rejected.body.data.rejectionReason).toBe(
      'Quantity is not justified',
    );

    const requesterNotes = await request(http)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(
      requesterNotes.body.data.some(
        (note: { eventType: string; entityId: string }) =>
          note.eventType === 'APPROVAL_REJECTED' &&
          note.entityId === exception._id,
      ),
    ).toBe(true);
    const siteNotes = await request(http)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${engineer}`)
      .expect(200);
    expect(
      siteNotes.body.data.some(
        (note: { eventType: string; entityId: string }) =>
          note.eventType === 'APPROVAL_REJECTED' &&
          note.entityId === exception._id,
      ),
    ).toBe(true);
    const history = await request(http)
      .get(`/api/v1/workflows/instances/${exception.workflowInstanceId}`)
      .set('Authorization', `Bearer ${head}`)
      .expect(200);
    expect(history.body.data.history.length).toBeGreaterThan(0);
    const audits = await request(http)
      .get('/api/v1/audit-logs')
      .query({
        entityType: 'MaterialRequest',
        entityId: exception._id,
        action: 'REJECT',
      })
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(audits.body.data.length).toBeGreaterThan(0);
    await request(http)
      .get(`/api/v1/material-requests/${exception._id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('aggregates two approved requests and flags the next 5 as 35%', async () => {
    await approveRequest(await draftRequest(10));
    const current = await submitRequest(await draftRequest(5));
    expect(current.exceptionStatus).toBe('EXCEPTION');
    expect(current.exceptionPercentage).toBe(35);
    const items = await request(http)
      .get(`/api/v1/material-requests/${current._id}/items`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(items.body.data[0].previouslyApprovedQuantity).toBe(30);
    expect(items.body.data[0].cumulativeQuantity).toBe(35);
  });

  it('lets an employee punch only assigned sites and only inside each site radius', async () => {
    const assigned = await request(http)
      .get(`/api/v1/employees/${employeeId}/site-assignments`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(assigned.body.data).toHaveLength(3);

    const near = northOf(50);
    const punch = await request(http)
      .post('/api/v1/attendance/punch-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ siteId: siteA, ...near, accuracy: 5 })
      .expect(201);
    expect(punch.body.data.distanceFromSite).toBeGreaterThan(45);
    expect(punch.body.data.distanceFromSite).toBeLessThan(55);
    expect(punch.body.data.projectId).toBe(projectId);

    await request(http)
      .post('/api/v1/attendance/punch-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ siteId: siteA, ...near })
      .expect(409);
    await request(http)
      .post('/api/v1/attendance/punch-out')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ siteId: siteA, ...near })
      .expect(201);

    await request(http)
      .post('/api/v1/attendance/punch-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ siteId: siteA, ...northOf(150) })
      .expect(400);

    await request(http)
      .post('/api/v1/attendance/punch-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ siteId: siteA, ...northOf(200) })
      .expect(400);
    const siteBPunch = await request(http)
      .post('/api/v1/attendance/punch-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ siteId: siteB, ...northOf(200) })
      .expect(201);
    expect(siteBPunch.body.data.siteId).toBe(siteB);
    await request(http)
      .post('/api/v1/attendance/punch-out')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ siteId: siteB, ...northOf(200) })
      .expect(201);

    await request(http)
      .post('/api/v1/attendance/punch-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ siteId: siteC, ...northOf(400) })
      .expect(201);
    await request(http)
      .post('/api/v1/attendance/punch-out')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ siteId: siteC, ...northOf(400) })
      .expect(201);

    await request(http)
      .post('/api/v1/attendance/punch-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ siteId: siteD, ...near })
      .expect(403);
  });

  it('creates a site assignment only after HR approves additional access', async () => {
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000 * 10).toISOString();
    const requested = await request(http)
      .post('/api/v1/site-access-requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        requestedSiteId: siteD,
        reason: 'Night shift cover',
        requestedFrom: from,
        requestedTo: to,
      })
      .expect(201);
    expect(requested.body.data.status).toBe('PENDING');

    await request(http)
      .post(`/api/v1/site-access-requests/${requested.body.data._id}/reject`)
      .set('Authorization', `Bearer ${hr}`)
      .send({})
      .expect(400);

    const siteE = await makeSite(tokenA, projectId, 'SITE-E', 100);
    const rejected = await request(http)
      .post('/api/v1/site-access-requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        requestedSiteId: siteE,
        reason: 'Inspection visit',
        requestedFrom: from,
        requestedTo: to,
      })
      .expect(201);
    await request(http)
      .post(`/api/v1/site-access-requests/${rejected.body.data._id}/reject`)
      .set('Authorization', `Bearer ${hr}`)
      .send({ reason: 'Not required this week' })
      .expect(201);
    const rejectedRow = await request(http)
      .get(`/api/v1/site-access-requests/${rejected.body.data._id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(rejectedRow.body.data.status).toBe('REJECTED');
    const assignments = await request(http)
      .get(`/api/v1/employees/${employeeId}/site-assignments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(
      assignments.body.data.some(
        (row: { siteId: string }) => row.siteId === siteE,
      ),
    ).toBe(false);
    const employeeNotes = await request(http)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(
      employeeNotes.body.data.some(
        (note: { eventType: string; entityId: string }) =>
          note.eventType === 'SITE_ACCESS_DECIDED' &&
          note.entityId === rejected.body.data._id,
      ),
    ).toBe(true);

    const approved = await request(http)
      .post(`/api/v1/site-access-requests/${requested.body.data._id}/approve`)
      .set('Authorization', `Bearer ${hr}`)
      .send({})
      .expect(201);
    expect(approved.body.data.status).toBe('APPROVED');
    const after = await request(http)
      .get(`/api/v1/employees/${employeeId}/site-assignments`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(
      after.body.data.some(
        (row: { siteId: string; status: string }) =>
          row.siteId === siteD && row.status === 'ACTIVE',
      ),
    ).toBe(true);
    await request(http)
      .post('/api/v1/attendance/punch-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ siteId: siteD, ...northOf(40) })
      .expect(201);
  });

  async function winProject(token: string) {
    const lead = await request(http)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyName: 'Phase 4 Client',
        contactPerson: 'Meera',
        email: 'meera@phase4.local',
        source: 'referral',
        estimatedValue: 1000000,
      })
      .expect(201);
    await request(http)
      .post(`/api/v1/leads/${lead.body.data._id}/qualify`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const converted = await request(http)
      .post(`/api/v1/leads/${lead.body.data._id}/convert`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const tender = await request(http)
      .post('/api/v1/tenders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        opportunityId: converted.body.data.opportunity._id,
        title: 'Phase 4 package',
        clientName: 'Phase 4 Client',
        issueDate: '2026-03-01',
        submissionDate: '2026-03-20',
        estimatedValue: 1000000,
      })
      .expect(201);
    await request(http)
      .post(`/api/v1/tenders/${tender.body.data._id}/requirements`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectType: 'CIVIL',
        description: 'Materials',
        location: 'Chennai',
        items: [
          {
            description: 'Cement',
            unit: 'bag',
            quantity: 100,
            estimatedRate: 400,
          },
        ],
      })
      .expect(201);
    const quotation = await request(http)
      .post(`/api/v1/tenders/${tender.body.data._id}/quotations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            description: 'Cement',
            quantity: 100,
            unit: 'bag',
            rate: 400,
            taxRate: 18,
          },
        ],
      })
      .expect(201);
    await request(http)
      .post(`/api/v1/quotations/${quotation.body.data._id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const win = await request(http)
      .post(`/api/v1/quotations/${quotation.body.data._id}/client-decision`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'WIN' })
      .expect(201);
    return win.body.data.project._id as string;
  }

  async function makeSite(
    token: string,
    project: string,
    code: string,
    radius: number,
  ) {
    const created = await request(http)
      .post(`/api/v1/projects/${project}/sites`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: code,
        code,
        latitude: SITE.latitude,
        longitude: SITE.longitude,
        geofenceRadius: radius,
      })
      .expect(201);
    await request(http)
      .post(`/api/v1/sites/${created.body.data._id}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    return created.body.data._id as string;
  }

  async function draftRequest(quantity: number) {
    const created = await request(http)
      .post(`/api/v1/projects/${projectId}/material-requests`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        siteId: siteA,
        requiredDate: '2026-10-01',
        remarks: 'Need cement',
      })
      .expect(201);
    await request(http)
      .post(`/api/v1/material-requests/${created.body.data._id}/items`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ boqItemId, currentRequestQuantity: quantity })
      .expect(201);
    return created.body.data._id as string;
  }

  async function submitRequest(id: string) {
    const submitted = await request(http)
      .post(`/api/v1/material-requests/${id}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    return submitted.body.data as {
      _id: string;
      exceptionStatus: string;
      exceptionPercentage: number;
      workflowInstanceId: string;
    };
  }

  async function approveRequest(id: string) {
    const submitted = await submitRequest(id);
    expect(submitted.exceptionStatus).toBe('NORMAL');
    await request(http)
      .post(
        `/api/v1/workflows/instances/${submitted.workflowInstanceId}/actions`,
      )
      .set('Authorization', `Bearer ${head}`)
      .send({ action: 'APPROVE' })
      .expect(201);
    return submitted;
  }
});

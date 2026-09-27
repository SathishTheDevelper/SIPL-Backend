import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  DEMO_PASSWORD,
  EMPLOYEE_PASSWORD,
  runSeed,
} from '../src/database/seed/seed';
import { createTestingApp, stopTestingMongo } from './test-app';

describe('Phase 3 (e2e)', () => {
  let app: INestApplication;
  let http: App;
  let tokenA: string;
  let tokenB: string;
  let employeeA: string;
  let tenantA: string;

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
    const loginEmp = await request(http).post('/api/v1/auth/login').send({
      email: 'employee.a@tenant-a.local',
      password: EMPLOYEE_PASSWORD,
      tenantCode: 'TENANTA',
    });
    tokenA = loginA.body.data.accessToken;
    tokenB = loginB.body.data.accessToken;
    employeeA = loginEmp.body.data.accessToken;
    tenantA = loginA.body.data.user.tenantId;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await stopTestingMongo();
  });

  async function createLead(
    token = tokenA,
    extra: Record<string, unknown> = {},
  ) {
    const res = await request(http)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyName: 'Harbor Constructions',
        contactPerson: 'Anita Rao',
        email: 'anita@harbor.local',
        source: 'referral',
        estimatedValue: 2500000,
        customFields: { industry: 'civil' },
        ...extra,
      })
      .expect(201);
    return res.body.data;
  }

  async function qualifyAndConvert(leadId: string, token = tokenA) {
    await request(http)
      .post(`/api/v1/leads/${leadId}/qualify`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const converted = await request(http)
      .post(`/api/v1/leads/${leadId}/convert`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    return converted.body.data.opportunity;
  }

  async function createTender(opportunityId: string, token = tokenA) {
    const res = await request(http)
      .post('/api/v1/tenders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        opportunityId,
        title: 'Chennai HQ civil package',
        clientName: 'Harbor Constructions',
        issueDate: '2026-01-10',
        submissionDate: '2026-02-10',
        estimatedValue: 2500000,
      })
      .expect(201);
    return res.body.data;
  }

  async function addRequirement(tenderId: string, token = tokenA) {
    const res = await request(http)
      .post(`/api/v1/tenders/${tenderId}/requirements`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectType: 'CIVIL',
        description: 'Foundation and superstructure',
        location: 'Chennai',
        items: [
          { description: 'RCC', unit: 'm3', quantity: 10, estimatedRate: 8000 },
        ],
      })
      .expect(201);
    return res.body.data;
  }

  async function createAndSubmitQuotation(tenderId: string, token = tokenA) {
    const created = await request(http)
      .post(`/api/v1/tenders/${tenderId}/quotations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            description: 'RCC',
            quantity: 10,
            unit: 'm3',
            rate: 8000,
            taxRate: 18,
          },
        ],
      })
      .expect(201);
    const submitted = await request(http)
      .post(`/api/v1/quotations/${created.body.data._id}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    return { draft: created.body.data, submitted: submitted.body.data };
  }

  it('1. creates a lead with a numbering-engine document number', async () => {
    const lead = await createLead();
    expect(lead.leadNumber).toMatch(/^LD-\d{4}-\d+$/);
    expect(lead.status).toBe('NEW');
    expect(lead.tenantId).toBe(tenantA);
  });

  it('2. isolates leads across tenants', async () => {
    const lead = await createLead(tokenA, { companyName: 'Private Lead A' });
    await request(http)
      .get(`/api/v1/leads/${lead._id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('3. qualifies a lead', async () => {
    const lead = await createLead(tokenA, { companyName: 'Qualify Me' });
    const qualified = await request(http)
      .post(`/api/v1/leads/${lead._id}/qualify`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    expect(qualified.body.data.status).toBe('QUALIFIED');
  });

  it('4-5. converts a qualified lead into an opportunity linked by leadId', async () => {
    const lead = await createLead(tokenA, { companyName: 'Convert Me' });
    const opportunity = await qualifyAndConvert(lead._id);
    expect(opportunity.leadId).toBe(lead._id);
    expect(opportunity.opportunityNumber).toMatch(/^OP-\d{4}-\d+$/);
    expect(opportunity.status).toBe('OPEN');
  });

  it('6. moves opportunity stages in order and rejects skips', async () => {
    const lead = await createLead(tokenA, { companyName: 'Stage Co' });
    const opportunity = await qualifyAndConvert(lead._id);
    await request(http)
      .post(`/api/v1/opportunities/${opportunity._id}/move-stage`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ stage: 'PROPOSAL' })
      .expect(400);
    const moved = await request(http)
      .post(`/api/v1/opportunities/${opportunity._id}/move-stage`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ stage: 'QUALIFICATION' })
      .expect(201);
    expect(moved.body.data.stage).toBe('QUALIFICATION');
  });

  it('7-8. LOST opportunity/tender cannot create a project', async () => {
    const lead = await createLead(tokenA, { companyName: 'Lost Deal' });
    const opportunity = await qualifyAndConvert(lead._id);
    await request(http)
      .post(`/api/v1/opportunities/${opportunity._id}/lose`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ lostReason: 'Budget withdrawn' })
      .expect(201);

    const tender = await createTender(opportunity._id);
    await request(http)
      .post(`/api/v1/tenders/${tender._id}/lose`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ lostReason: 'Client awarded competitor' })
      .expect(201);

    const created = await request(http)
      .post(`/api/v1/tenders/${tender._id}/quotations`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ items: [{ description: 'X', quantity: 1, rate: 100 }] })
      .expect(201);
    await request(http)
      .post(`/api/v1/quotations/${created.body.data._id}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);

    await request(http)
      .post(`/api/v1/quotations/${created.body.data._id}/client-decision`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ decision: 'WIN' })
      .expect((res) => {
        expect([400, 409]).toContain(res.status);
        expect(res.body.errorCode).toBe('PROJECT_NOT_ALLOWED');
      });

    const loseDecision = await request(http)
      .post(`/api/v1/quotations/${created.body.data._id}/client-decision`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ decision: 'LOSE', reason: 'Price' })
      .expect(201);
    expect(loseDecision.body.data.project).toBeNull();

    await request(http)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ clientDecisionId: loseDecision.body.data.decision._id })
      .expect((res) => {
        expect([400, 409]).toContain(res.status);
        expect(res.body.success).toBe(false);
        expect(res.body.errorCode).toBe('PROJECT_NOT_ALLOWED');
      });

    const projects = await request(http)
      .get('/api/v1/projects')
      .query({ q: 'Lost Deal' })
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(projects.body.data).toHaveLength(0);
  });

  it('9-14. creates tender, requirement, quotation, totals and revision', async () => {
    const lead = await createLead(tokenA, { companyName: 'Quote Co' });
    const opportunity = await qualifyAndConvert(lead._id);
    const tender = await createTender(opportunity._id);
    expect(tender.tenderNumber).toMatch(/^TN-\d{4}-\d+$/);

    await request(http)
      .post(`/api/v1/tenders/${tender._id}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);

    const requirement = await addRequirement(tender._id);
    expect(requirement.items[0].estimatedAmount).toBe(80000);

    const { draft, submitted } = await createAndSubmitQuotation(tender._id);
    expect(draft.subtotal).toBe(80000);
    expect(draft.tax).toBe(14400);
    expect(draft.total).toBe(94400);
    expect(submitted.status).toBe('SUBMITTED');
    expect(draft.quotationNumber).toMatch(/^QT-\d{4}-\d+$/);

    const revised = await request(http)
      .post(`/api/v1/quotations/${submitted._id}/revise`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        items: [
          {
            description: 'RCC',
            quantity: 12,
            unit: 'm3',
            rate: 8000,
            taxRate: 18,
          },
        ],
      })
      .expect(201);
    expect(revised.body.data.version).toBe(2);
    expect(revised.body.data.previousQuotationId).toBe(submitted._id);
    expect(revised.body.data.isCurrent).toBe(true);
    expect(revised.body.data.subtotal).toBe(96000);

    const original = await request(http)
      .get(`/api/v1/quotations/${submitted._id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(original.body.data.status).toBe('REVISED');
    expect(original.body.data.isCurrent).toBe(false);
  });

  it('15-17, 25, 48. WIN creates one transactional project with source refs', async () => {
    const lead = await createLead(tokenA, { companyName: 'Win Client' });
    const opportunity = await qualifyAndConvert(lead._id);
    const tender = await createTender(opportunity._id);
    await addRequirement(tender._id);
    const { submitted } = await createAndSubmitQuotation(tender._id);

    const win = await request(http)
      .post(`/api/v1/quotations/${submitted._id}/client-decision`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ decision: 'WIN', remarks: 'Awarded' })
      .expect(201);

    const project = win.body.data.project;
    expect(project).toBeTruthy();
    expect(project.projectNumber).toMatch(/^PRJ-\d{4}-\d+$/);
    expect(project.tenderId).toBe(tender._id);
    expect(project.opportunityId).toBe(opportunity._id);
    expect(project.quotationId).toBe(submitted._id);
    expect(project.tenantId).toBe(tenantA);
    expect(project.status).toBe('PLANNING');

    const duplicate = await request(http)
      .post(`/api/v1/quotations/${submitted._id}/client-decision`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ decision: 'WIN' })
      .expect(201);
    expect(duplicate.body.data.project._id).toBe(project._id);

    const listed = await request(http)
      .get('/api/v1/projects')
      .query({ limit: 100 })
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(
      listed.body.data.filter(
        (item: { _id: string }) => item._id === project._id,
      ),
    ).toHaveLength(1);

    const logs = await request(http)
      .get('/api/v1/audit-logs')
      .query({ module: 'PROJECT', entityId: project._id })
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(logs.body.data.length).toBeGreaterThan(0);
  });

  it('18. isolates projects across tenants', async () => {
    const lead = await createLead(tokenA, { companyName: 'Isolation Project' });
    const opportunity = await qualifyAndConvert(lead._id);
    const tender = await createTender(opportunity._id);
    await addRequirement(tender._id);
    const { submitted } = await createAndSubmitQuotation(tender._id);
    const win = await request(http)
      .post(`/api/v1/quotations/${submitted._id}/client-decision`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ decision: 'WIN' })
      .expect(201);

    await request(http)
      .get(`/api/v1/projects/${win.body.data.project._id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('19-21. creates a site, validates geofence, and isolates tenants', async () => {
    const lead = await createLead(tokenA, { companyName: 'Site Client' });
    const opportunity = await qualifyAndConvert(lead._id);
    const tender = await createTender(opportunity._id);
    await addRequirement(tender._id);
    const { submitted } = await createAndSubmitQuotation(tender._id);
    const win = await request(http)
      .post(`/api/v1/quotations/${submitted._id}/client-decision`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ decision: 'WIN' })
      .expect(201);
    const projectId = win.body.data.project._id;

    await request(http)
      .post(`/api/v1/projects/${projectId}/sites`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Bad geo',
        code: 'BAD',
        latitude: 200,
        longitude: 80,
        geofenceRadius: 50,
      })
      .expect(400);

    await request(http)
      .post(`/api/v1/projects/${projectId}/sites`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Zero fence',
        code: 'ZERO',
        latitude: 13.08,
        longitude: 80.27,
        geofenceRadius: 0,
      })
      .expect(400);

    const site = await request(http)
      .post(`/api/v1/projects/${projectId}/sites`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Chennai plot',
        code: 'CHN-01',
        latitude: 13.0827,
        longitude: 80.2707,
        geofenceRadius: 175,
        city: 'Chennai',
      })
      .expect(201);
    expect(site.body.data.geofenceRadius).toBe(175);
    expect(site.body.data.code).toBe('CHN-01');
    expect(site.body.data.projectId).toBe(projectId);
    expect(site.body.data.tenantId).toBe(tenantA);

    await request(http)
      .get(`/api/v1/sites/${site.body.data._id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('22. validates lead custom fields', async () => {
    const lead = await createLead(tokenA, {
      companyName: 'Custom Field Co',
      customFields: { industry: 'interior' },
    });
    expect(lead.customFields.industry).toBe('interior');
  });

  it('23. enforces RBAC on lead create', async () => {
    await request(http)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${employeeA}`)
      .send({
        companyName: 'No Access',
        contactPerson: 'None',
      })
      .expect(403);
  });

  it('24-25. writes audit logs and uses numbering', async () => {
    const lead = await createLead(tokenA, { companyName: 'Audit Co' });
    const logs = await request(http)
      .get('/api/v1/audit-logs')
      .query({ module: 'LEAD', entityId: lead._id })
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(
      logs.body.data.some(
        (item: { action: string }) => item.action === 'CREATE',
      ),
    ).toBe(true);
    expect(lead.leadNumber).toMatch(/^LD-/);
  });

  it('returns tenant-scoped dashboard summaries', async () => {
    const bd = await request(http)
      .get('/api/v1/business-development/summary')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(bd.body.data.leadCount).toBeGreaterThan(0);
    const projects = await request(http)
      .get('/api/v1/projects/summary')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(projects.body.data.totalProjects).toBeGreaterThan(0);
  });

  it('supports lead activities', async () => {
    const lead = await createLead(tokenA, { companyName: 'Activity Co' });
    await request(http)
      .post(`/api/v1/leads/${lead._id}/activities`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'CALL', note: 'Intro call completed' })
      .expect(201);
    const list = await request(http)
      .get(`/api/v1/leads/${lead._id}/activities`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(list.body.data[0].note).toContain('Intro call');
  });
});

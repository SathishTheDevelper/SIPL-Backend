import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { DEMO_PASSWORD, runSeed } from '../src/database/seed/seed';
import {
  ComparisonStatementSource,
  ProcurementRequestSource,
  PurchaseApprovalSource,
  VendorSelectionItemSource,
  VendorSelectionSource,
  VendorSource,
} from '../src/purchase-orders/schemas/upstream.schema';
import { createTestingApp, stopTestingMongo } from './test-app';

describe('Phase 6 (e2e)', () => {
  let app: INestApplication;
  let http: App;
  let tokenA: string;
  let tokenB: string;
  let head: string;
  let tenantA: string;
  let tenantB: string;
  let projectId: string;
  let siteId: string;
  let materialId: string;
  let unitId: string;

  let approvals: Model<PurchaseApprovalSource>;
  let selections: Model<VendorSelectionSource>;
  let selectionItems: Model<VendorSelectionItemSource>;
  let procurements: Model<ProcurementRequestSource>;
  let comparisons: Model<ComparisonStatementSource>;
  let vendors: Model<VendorSource>;

  let mainPoId: string;
  let mainItemId: string;
  let chargeId: string;
  let deliveryId: string;
  let grnId: string;

  beforeAll(async () => {
    app = await createTestingApp();
    http = app.getHttpServer() as App;
    await runSeed({ disconnect: false });
    approvals = app.get(getModelToken(PurchaseApprovalSource.name));
    selections = app.get(getModelToken(VendorSelectionSource.name));
    selectionItems = app.get(getModelToken(VendorSelectionItemSource.name));
    procurements = app.get(getModelToken(ProcurementRequestSource.name));
    comparisons = app.get(getModelToken(ComparisonStatementSource.name));
    vendors = app.get(getModelToken(VendorSource.name));

    const login = async (email: string, tenantCode = 'TENANTA') => {
      const res = await request(http)
        .post('/api/v1/auth/login')
        .send({ email, password: DEMO_PASSWORD, tenantCode })
        .expect(201);
      return res.body.data as {
        accessToken: string;
        user: { tenantId: string };
      };
    };
    const admin = await login('admin.a@tenant-a.local');
    const other = await login('admin.b@tenant-b.local', 'TENANTB');
    tokenA = admin.accessToken;
    tenantA = admin.user.tenantId;
    tokenB = other.accessToken;
    tenantB = other.user.tenantId;
    head = (await login('projecthead.a@tenant-a.local')).accessToken;

    projectId = await winProject(tokenA);
    const site = await request(http)
      .post(`/api/v1/projects/${projectId}/sites`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Phase 6 Site',
        code: 'P6-SITE',
        latitude: 13.0827,
        longitude: 80.2707,
        geofenceRadius: 100,
      })
      .expect(201);
    siteId = site.body.data._id;
    await request(http)
      .post(`/api/v1/sites/${siteId}/activate`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    const category = await request(http)
      .post('/api/v1/material-categories')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'STEEL', name: 'Steel' })
      .expect(201);
    const unit = await request(http)
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'KG', name: 'Kilogram', symbol: 'kg' })
      .expect(201);
    unitId = unit.body.data._id;
    const material = await request(http)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        materialCode: 'STL-01',
        name: 'Reinforcement steel',
        categoryId: category.body.data._id,
        unitId,
        defaultRate: 1000,
      })
      .expect(201);
    materialId = material.body.data._id;
  });

  afterAll(async () => {
    if (app) await app.close();
    await stopTestingMongo();
  });

  it('rejects a purchase order before the purchase approval is APPROVED', async () => {
    const pending = await seedApproval({
      tenantId: tenantA,
      status: 'PENDING',
      quantity: 10,
      rate: 10,
    });
    const res = await request(http)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ purchaseApprovalId: pending })
      .expect(409);
    expect(res.body.errorCode).toBe('PURCHASE_APPROVAL_REQUIRED');
  });

  it('hides another tenant purchase approval', async () => {
    const foreign = await seedApproval({
      tenantId: tenantB,
      status: 'APPROVED',
      quantity: 10,
      rate: 10,
    });
    const res = await request(http)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ purchaseApprovalId: foreign })
      .expect(404);
    expect(res.body.errorCode).toBe('NOT_FOUND');
  });

  it('creates a numbered PO with calculated items, charges, and grand total', async () => {
    const approvalId = await seedApproval({
      tenantId: tenantA,
      status: 'APPROVED',
      quantity: 100,
      rate: 1000,
    });
    const created = await request(http)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        purchaseApprovalId: approvalId,
        charges: [
          { chargeType: 'DELIVERY', description: 'Delivery', amount: 5000 },
          {
            chargeType: 'INSTALLATION',
            description: 'Installation',
            amount: 10000,
          },
          {
            chargeType: 'TRANSPORTATION',
            description: 'Transportation',
            amount: 7000,
          },
        ],
      })
      .expect(201);
    expect(created.body.data.poNumber).toMatch(/^PO-\d{4}-\d{5}$/);
    expect(created.body.data.subtotal).toBe(100000);
    expect(created.body.data.additionalChargesTotal).toBe(22000);
    expect(created.body.data.grandTotal).toBe(122000);
    expect(created.body.data.status).toBe('DRAFT');
    mainPoId = created.body.data._id;

    const duplicate = await request(http)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ purchaseApprovalId: approvalId })
      .expect(201);
    expect(duplicate.body.data._id).toBe(mainPoId);
    expect(duplicate.body.data.poNumber).toBe(created.body.data.poNumber);

    const items = await request(http)
      .get(`/api/v1/purchase-orders/${mainPoId}/items`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(items.body.data).toHaveLength(1);
    expect(items.body.data[0].quantity).toBe(100);
    expect(items.body.data[0].unitRate).toBe(1000);
    expect(items.body.data[0].lineTotal).toBe(100000);
    expect(items.body.data[0].pendingQuantity).toBe(100);
    expect(items.body.data[0].receivedQuantity).toBe(0);
    mainItemId = items.body.data[0]._id;

    const charges = await request(http)
      .get(`/api/v1/purchase-orders/${mainPoId}/charges`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(charges.body.data).toHaveLength(3);
    expect(
      charges.body.data
        .map((row: { amount: number }) => row.amount)
        .sort((left: number, right: number) => left - right),
    ).toEqual([5000, 7000, 10000]);
    for (const charge of charges.body.data) {
      expect(charge.purchaseOrderId).toBe(mainPoId);
      expect(charge.projectId).toBe(projectId);
      expect(charge.vendorId).toBeDefined();
    }
    chargeId = charges.body.data[0]._id;

    const summary = await request(http)
      .get('/api/v1/purchase-orders/summary')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(summary.body.data.draftPOs).toBeGreaterThanOrEqual(1);
  });

  it('submits and approves through the purchase order workflow', async () => {
    const submitted = await request(http)
      .post(`/api/v1/purchase-orders/${mainPoId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    expect(submitted.body.data.status).toBe('PENDING_APPROVAL');
    expect(submitted.body.data.approvalStatus).toBe('PENDING');
    const again = await request(http)
      .post(`/api/v1/purchase-orders/${mainPoId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    expect(again.body.data.workflowInstanceId).toBe(
      submitted.body.data.workflowInstanceId,
    );
    await request(http)
      .post(
        `/api/v1/workflows/instances/${submitted.body.data.workflowInstanceId}/actions`,
      )
      .set('Authorization', `Bearer ${head}`)
      .send({ action: 'APPROVE' })
      .expect(201);
    const approved = await request(http)
      .get(`/api/v1/purchase-orders/${mainPoId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(approved.body.data.status).toBe('APPROVED');
    expect(approved.body.data.approvalStatus).toBe('APPROVED');

    const amendment = await request(http)
      .post(`/api/v1/purchase-orders/${mainPoId}/charges`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ chargeType: 'OTHER', description: 'Late fee', amount: 10 })
      .expect(409);
    expect(amendment.body.errorCode).toBe('PO_AMENDMENT_REQUIRED');
  });

  it('requires a reason to reject and does not mark the PO approved', async () => {
    const poId = await createDraftPo(5, 100);
    const submitted = await request(http)
      .post(`/api/v1/purchase-orders/${poId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    const instanceId = submitted.body.data.workflowInstanceId as string;
    const missing = await request(http)
      .post(`/api/v1/workflows/instances/${instanceId}/actions`)
      .set('Authorization', `Bearer ${head}`)
      .send({ action: 'REJECT' })
      .expect(400);
    expect(missing.body.errorCode).toBe('REASON_REQUIRED');
    await request(http)
      .post(`/api/v1/workflows/instances/${instanceId}/actions`)
      .set('Authorization', `Bearer ${head}`)
      .send({ action: 'REJECT', reason: 'Rate is not acceptable' })
      .expect(201);
    const rejected = await request(http)
      .get(`/api/v1/purchase-orders/${poId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(rejected.body.data.approvalStatus).toBe('REJECTED');
    expect(rejected.body.data.status).not.toBe('APPROVED');
  });

  it('sends a purchase order back with a reason and allows correction', async () => {
    const poId = await createDraftPo(4, 50);
    const submitted = await request(http)
      .post(`/api/v1/purchase-orders/${poId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    const missing = await request(http)
      .post(
        `/api/v1/workflows/instances/${submitted.body.data.workflowInstanceId}/actions`,
      )
      .set('Authorization', `Bearer ${head}`)
      .send({ action: 'SEND_BACK' })
      .expect(400);
    expect(missing.body.errorCode).toBe('REASON_REQUIRED');
    await request(http)
      .post(
        `/api/v1/workflows/instances/${submitted.body.data.workflowInstanceId}/actions`,
      )
      .set('Authorization', `Bearer ${head}`)
      .send({ action: 'SEND_BACK', reason: 'Confirm the delivery date' })
      .expect(201);
    const sentBack = await request(http)
      .get(`/api/v1/purchase-orders/${poId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(sentBack.body.data.status).toBe('DRAFT');
    expect(sentBack.body.data.approvalStatus).toBe('SEND_BACK');
    await request(http)
      .patch(`/api/v1/purchase-orders/${poId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ remarks: 'Date confirmed' })
      .expect(200);
  });

  it('cancels only when a reason is provided', async () => {
    const poId = await createDraftPo(2, 25);
    await request(http)
      .post(`/api/v1/purchase-orders/${poId}/cancel`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({})
      .expect(400);
    const cancelled = await request(http)
      .post(`/api/v1/purchase-orders/${poId}/cancel`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ reason: 'Vendor withdrew' })
      .expect(201);
    expect(cancelled.body.data.status).toBe('CANCELLED');
  });

  it('keeps PO received at zero after delivery and updates it only when the GRN is approved', async () => {
    await request(http)
      .post(`/api/v1/purchase-orders/${mainPoId}/send-to-vendor`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    await request(http)
      .post(`/api/v1/purchase-orders/${mainPoId}/acknowledge`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        acknowledgedAt: '2026-10-01T10:00:00.000Z',
        remarks: 'Accepted',
        expectedDeliveryDate: '2026-10-15',
      })
      .expect(201);

    deliveryId = await ship(mainPoId, mainItemId, 40);
    const delivered = await request(http)
      .get(`/api/v1/deliveries/${deliveryId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(delivered.body.data.status).toBe('DELIVERED');
    const beforeGrn = await request(http)
      .get(`/api/v1/purchase-orders/${mainPoId}/items`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(beforeGrn.body.data[0].receivedQuantity).toBe(0);
    expect(beforeGrn.body.data[0].pendingQuantity).toBe(100);

    grnId = await receive(mainPoId, deliveryId, mainItemId, 40);
    const partial = await request(http)
      .get(`/api/v1/purchase-orders/${mainPoId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(partial.body.data.status).toBe('PARTIALLY_DELIVERED');
    const partialItem = await request(http)
      .get(`/api/v1/purchase-orders/${mainPoId}/items`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(partialItem.body.data[0].receivedQuantity).toBe(40);
    expect(partialItem.body.data[0].pendingQuantity).toBe(60);

    const secondDelivery = await ship(mainPoId, mainItemId, 30);
    await receive(mainPoId, secondDelivery, mainItemId, 30);
    const thirdDelivery = await ship(mainPoId, mainItemId, 30);
    await receive(mainPoId, thirdDelivery, mainItemId, 30);
    const done = await request(http)
      .get(`/api/v1/purchase-orders/${mainPoId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(done.body.data.status).toBe('FULLY_DELIVERED');
    const doneItem = await request(http)
      .get(`/api/v1/purchase-orders/${mainPoId}/items`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(doneItem.body.data[0].receivedQuantity).toBe(100);
    expect(doneItem.body.data[0].pendingQuantity).toBe(0);

    const grns = await request(http)
      .get(`/api/v1/purchase-orders/${mainPoId}/grns`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(grns.body.data.length).toBe(3);
  });

  it('rejects a GRN of 101 against a purchase order of 100', async () => {
    const approvalId = await seedApproval({
      tenantId: tenantA,
      status: 'APPROVED',
      quantity: 100,
      rate: 10,
    });
    const po = await request(http)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ purchaseApprovalId: approvalId })
      .expect(201);
    const poId = po.body.data._id as string;
    await approvePo(poId);
    const items = await request(http)
      .get(`/api/v1/purchase-orders/${poId}/items`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const itemId = items.body.data[0]._id as string;
    const shipped = await ship(poId, itemId, 100);
    const res = await request(http)
      .post(`/api/v1/purchase-orders/${poId}/grns`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        deliveryId: shipped,
        items: [
          {
            purchaseOrderItemId: itemId,
            receivedQuantity: 101,
            acceptedQuantity: 101,
            rejectedQuantity: 0,
          },
        ],
      })
      .expect(409);
    expect(res.body.errorCode).toBe('PO_QUANTITY_EXCEEDED');
  });

  it('does not let concurrent GRNs of 70 and 50 exceed an order of 100', async () => {
    const approvalId = await seedApproval({
      tenantId: tenantA,
      status: 'APPROVED',
      quantity: 100,
      rate: 10,
    });
    const po = await request(http)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ purchaseApprovalId: approvalId })
      .expect(201);
    const poId = po.body.data._id as string;
    await approvePo(poId);
    const items = await request(http)
      .get(`/api/v1/purchase-orders/${poId}/items`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const itemId = items.body.data[0]._id as string;
    const shipped = await ship(poId, itemId, 100);
    const first = await draftGrn(poId, shipped, itemId, 70);
    const second = await draftGrn(poId, shipped, itemId, 50);
    await submitGrn(first);
    await submitGrn(second);
    const [left, right] = await Promise.all([
      request(http)
        .post(`/api/v1/grns/${first}/approve`)
        .set('Authorization', `Bearer ${head}`),
      request(http)
        .post(`/api/v1/grns/${second}/approve`)
        .set('Authorization', `Bearer ${head}`),
    ]);
    const statuses = [left.status, right.status];
    expect(statuses).toContain(201);
    const failed = [left, right].find((res) => res.status !== 201);
    expect(failed?.body.errorCode).toBe('PO_QUANTITY_EXCEEDED');
    const after = await request(http)
      .get(`/api/v1/purchase-orders/${poId}/items`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const received = after.body.data[0].receivedQuantity as number;
    const pending = after.body.data[0].pendingQuantity as number;
    expect([70, 50]).toContain(received);
    expect(received + pending).toBe(100);
    expect(pending).toBeGreaterThanOrEqual(0);
    expect(received).toBeLessThanOrEqual(100);
  });

  it('returns 404 when tenant B reads tenant A procurement documents', async () => {
    const paths = [
      `/api/v1/purchase-orders/${mainPoId}`,
      `/api/v1/purchase-orders/${mainPoId}/items`,
      `/api/v1/purchase-orders/${mainPoId}/charges`,
      `/api/v1/purchase-order-charges/${chargeId}`,
      `/api/v1/deliveries/${deliveryId}`,
      `/api/v1/grns/${grnId}`,
      `/api/v1/grns/${grnId}/items`,
    ];
    for (const path of paths) {
      const res = await request(http)
        .get(path)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
      expect(res.body.errorCode).toBe('NOT_FOUND');
    }
  });

  async function winProject(token: string) {
    const lead = await request(http)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyName: 'Phase 6 Client',
        contactPerson: 'Anika',
        email: 'anika@phase6.local',
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
        title: 'Phase 6 package',
        clientName: 'Phase 6 Client',
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
        description: 'Steel',
        location: 'Chennai',
        items: [
          {
            description: 'Steel',
            unit: 'kg',
            quantity: 100,
            estimatedRate: 1000,
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
            description: 'Steel',
            quantity: 100,
            unit: 'kg',
            rate: 1000,
            taxRate: 0,
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

  async function seedApproval(input: {
    tenantId: string;
    status: string;
    quantity: number;
    rate: number;
  }) {
    const tenantId = new Types.ObjectId(input.tenantId);
    const project = new Types.ObjectId(projectId);
    const site = new Types.ObjectId(siteId);
    const vendor = await vendors.create({
      tenantId,
      name: `Vendor ${new Types.ObjectId().toString()}`,
      status: 'ACTIVE',
    });
    const procurement = await procurements.create({
      tenantId,
      projectId: project,
      siteId: site,
      status: 'VENDOR_SELECTED',
    });
    const comparison = await comparisons.create({
      tenantId,
      procurementRequestId: procurement._id,
    });
    const selection = await selections.create({
      tenantId,
      status: 'APPROVED',
      vendorId: vendor._id,
      projectId: project,
      siteId: site,
      procurementRequestId: procurement._id,
      comparisonStatementId: comparison._id,
    });
    await selectionItems.create({
      tenantId,
      vendorSelectionId: selection._id,
      materialId: new Types.ObjectId(materialId),
      unitId: new Types.ObjectId(unitId),
      description: 'Steel',
      quantity: input.quantity,
      unitRate: input.rate,
      discount: 0,
      taxRate: 0,
    });
    const approval = await approvals.create({
      tenantId,
      status: input.status,
      procurementRequestId: procurement._id,
      comparisonStatementId: comparison._id,
      vendorSelectionId: selection._id,
      projectId: project,
      siteId: site,
      vendorId: vendor._id,
    });
    return approval._id.toString();
  }

  async function createDraftPo(quantity: number, rate: number) {
    const approvalId = await seedApproval({
      tenantId: tenantA,
      status: 'APPROVED',
      quantity,
      rate,
    });
    const created = await request(http)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ purchaseApprovalId: approvalId })
      .expect(201);
    return created.body.data._id as string;
  }

  async function approvePo(poId: string) {
    const submitted = await request(http)
      .post(`/api/v1/purchase-orders/${poId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    await request(http)
      .post(
        `/api/v1/workflows/instances/${submitted.body.data.workflowInstanceId}/actions`,
      )
      .set('Authorization', `Bearer ${head}`)
      .send({ action: 'APPROVE' })
      .expect(201);
  }

  async function ship(poId: string, itemId: string, quantity: number) {
    const created = await request(http)
      .post(`/api/v1/purchase-orders/${poId}/deliveries`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        deliveryDate: '2026-10-02',
        vehicleNumber: 'TN01AB1234',
        driverName: 'Ravi',
        driverPhone: '9000000000',
        challanNumber: `CH-${quantity}`,
        items: [{ purchaseOrderItemId: itemId, quantity }],
      })
      .expect(201);
    const id = created.body.data._id as string;
    await request(http)
      .post(`/api/v1/deliveries/${id}/in-transit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    await request(http)
      .post(`/api/v1/deliveries/${id}/delivered`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    return id;
  }

  async function draftGrn(
    poId: string,
    delivery: string,
    itemId: string,
    quantity: number,
  ) {
    const created = await request(http)
      .post(`/api/v1/purchase-orders/${poId}/grns`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        deliveryId: delivery,
        items: [
          {
            purchaseOrderItemId: itemId,
            receivedQuantity: quantity,
            acceptedQuantity: quantity,
            rejectedQuantity: 0,
          },
        ],
      })
      .expect(201);
    return created.body.data._id as string;
  }

  async function submitGrn(id: string) {
    await request(http)
      .post(`/api/v1/grns/${id}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
  }

  async function receive(
    poId: string,
    delivery: string,
    itemId: string,
    quantity: number,
  ) {
    const id = await draftGrn(poId, delivery, itemId, quantity);
    await submitGrn(id);
    await request(http)
      .post(`/api/v1/grns/${id}/approve`)
      .set('Authorization', `Bearer ${head}`)
      .expect(201);
    return id;
  }
});

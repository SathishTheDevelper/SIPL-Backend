import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  DEMO_PASSWORD,
  EMPLOYEE_PASSWORD,
  runSeed,
} from '../src/database/seed/seed';
import {
  ComparisonStatementSource,
  ProcurementRequestSource,
  PurchaseApprovalSource,
  VendorSelectionItemSource,
  VendorSelectionSource,
  VendorSource,
} from '../src/purchase-orders/schemas/upstream.schema';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createTestingApp, stopTestingMongo } from './test-app';

describe('Phase 7 invoices and 3-way match (e2e)', () => {
  let app: INestApplication;
  let http: App;
  let tokenA: string;
  let tokenB: string;
  let accounts: string;
  let head: string;
  let employee: string;
  let tenantA: string;
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

  beforeAll(async () => {
    app = await createTestingApp();
    http = app.getHttpServer() as App;
    await runSeed({ disconnect: false });
    const connection = app.get<Connection>(getConnectionToken());
    for (const name of [
      'leads',
      'opportunities',
      'tenders',
      'requirements',
      'quotations',
      'client_decisions',
      'projects',
      'sites',
      'material_categories',
      'units_of_measure',
      'materials',
      'purchase_orders',
      'purchase_order_items',
      'purchase_order_charges',
      'deliveries',
      'delivery_items',
      'grns',
      'grn_items',
      'invoices',
      'invoice_items',
      'invoice_references',
      'invoice_match_results',
      'invoice_match_locks',
    ]) {
      await connection.collection(name).deleteMany({});
    }
    approvals = app.get(getModelToken(PurchaseApprovalSource.name));
    selections = app.get(getModelToken(VendorSelectionSource.name));
    selectionItems = app.get(getModelToken(VendorSelectionItemSource.name));
    procurements = app.get(getModelToken(ProcurementRequestSource.name));
    comparisons = app.get(getModelToken(ComparisonStatementSource.name));
    vendors = app.get(getModelToken(VendorSource.name));

    const login = async (
      email: string,
      tenantCode = 'TENANTA',
      password = DEMO_PASSWORD,
    ) => {
      const res = await request(http)
        .post('/api/v1/auth/login')
        .send({ email, password, tenantCode })
        .expect(201);
      return res.body.data as {
        accessToken: string;
        user: { tenantId: string };
      };
    };
    const admin = await login('admin.a@tenant-a.local');
    tokenA = admin.accessToken;
    tenantA = admin.user.tenantId;
    tokenB = (await login('admin.b@tenant-b.local', 'TENANTB')).accessToken;
    accounts = (await login('accounts.a@tenant-a.local')).accessToken;
    head = (await login('projecthead.a@tenant-a.local')).accessToken;
    employee = (
      await login('employee.a@tenant-a.local', 'TENANTA', EMPLOYEE_PASSWORD)
    ).accessToken;
    projectId = await winProject(tokenA);
    const site = await request(http)
      .post(`/api/v1/projects/${projectId}/sites`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Phase 7 Site',
        code: 'P7-SITE',
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
      .send({ code: 'P7CEMENT', name: 'Cement' })
      .expect(201);
    const unit = await request(http)
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ code: 'P7BAG', name: 'Bag', symbol: 'bag' })
      .expect(201);
    unitId = unit.body.data._id;
    const material = await request(http)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        materialCode: 'P7-CEM',
        name: 'Cement bag',
        categoryId: category.body.data._id,
        unitId,
        defaultRate: 100,
      })
      .expect(201);
    materialId = material.body.data._id;
  });

  afterAll(async () => {
    if (app) await app.close();
    await stopTestingMongo();
  });

  it('requires authentication and invoice permission', async () => {
    await request(http).post('/api/v1/invoices').send({}).expect(401);
    await request(http)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${employee}`)
      .send({})
      .expect(403);
  });

  it('matches 90 invoiced against 90 received on a PO of 100', async () => {
    const receipt = await openReceipt(100, 100, [90]);
    const invoiceId = await upload(receipt, 90, 9000, 'V-90');
    await submitAndReview(invoiceId);
    const matched = await request(http)
      .post(`/api/v1/invoices/${invoiceId}/three-way-match`)
      .set('Authorization', `Bearer ${accounts}`)
      .send({})
      .expect(201);
    expect(matched.body.data.status).toBe('MATCH');
    expect(matched.body.data.quantityMatched).toBe(true);
    expect(matched.body.data.summary.invoiceQuantity).toBe(90);
    expect(matched.body.data.summary.receivedQuantity).toBe(90);
    const again = await request(http)
      .post(`/api/v1/invoices/${invoiceId}/three-way-match`)
      .set('Authorization', `Bearer ${accounts}`)
      .send({})
      .expect(201);
    expect(again.body.data.matchResultId).toBe(matched.body.data.matchResultId);
    const approved = await request(http)
      .post(`/api/v1/invoices/${invoiceId}/approve`)
      .set('Authorization', `Bearer ${accounts}`)
      .expect(201);
    expect(approved.body.data.status).toBe('APPROVED');
    expect(approved.body.data).not.toHaveProperty('paymentId');
  });

  it('mismatches an invoice of 100 against a GRN of 90 and does not approve it', async () => {
    const receipt = await openReceipt(100, 100, [90]);
    const invoiceId = await upload(receipt, 100, 10000, 'V-100');
    await submitAndReview(invoiceId);
    const mismatched = await request(http)
      .post(`/api/v1/invoices/${invoiceId}/three-way-match`)
      .set('Authorization', `Bearer ${accounts}`)
      .send({})
      .expect(201);
    expect(mismatched.body.data.status).toBe('MISMATCH');
    expect(mismatched.body.data.issues[0].type).toBe('QUANTITY_MISMATCH');
    const denied = await request(http)
      .post(`/api/v1/invoices/${invoiceId}/approve`)
      .set('Authorization', `Bearer ${accounts}`)
      .expect(409);
    expect(denied.body.errorCode).toBe('INVALID_INVOICE_STATUS');
    const queue = await request(http)
      .get('/api/v1/invoices/accounts/mismatch')
      .set('Authorization', `Bearer ${accounts}`)
      .expect(200);
    expect(
      queue.body.data.some((row: { _id: string }) => row._id === invoiceId),
    ).toBe(true);
  });

  it('matches an invoice against two GRNs of 40 and 30', async () => {
    const receipt = await openReceipt(100, 100, [40, 30]);
    const invoiceId = await upload(receipt, 70, 7000, 'V-70');
    await submitAndReview(invoiceId);
    const matched = await request(http)
      .post(`/api/v1/invoices/${invoiceId}/three-way-match`)
      .set('Authorization', `Bearer ${accounts}`)
      .send({})
      .expect(201);
    expect(matched.body.data.status).toBe('MATCH');
    expect(matched.body.data.summary.receivedQuantity).toBe(70);
  });

  it('mismatches a second invoice that exceeds the remaining quantity', async () => {
    const receipt = await openReceipt(100, 100, [100]);
    const first = await upload(receipt, 60, 6000, 'V-60');
    await submitAndReview(first);
    const matched = await request(http)
      .post(`/api/v1/invoices/${first}/three-way-match`)
      .set('Authorization', `Bearer ${accounts}`)
      .send({})
      .expect(201);
    expect(matched.body.data.status).toBe('MATCH');
    const second = await upload(receipt, 50, 5000, 'V-50');
    await submitAndReview(second);
    const mismatched = await request(http)
      .post(`/api/v1/invoices/${second}/three-way-match`)
      .set('Authorization', `Bearer ${accounts}`)
      .send({})
      .expect(201);
    expect(mismatched.body.data.status).toBe('MISMATCH');
    expect(
      mismatched.body.data.issues.some(
        (issue: { message: string }) =>
          issue.message ===
          'Invoice quantity exceeds remaining invoiceable quantity',
      ),
    ).toBe(true);
  });

  it('holds and releases an invoice and hides it from another tenant', async () => {
    const receipt = await openReceipt(20, 50, [20]);
    const invoiceId = await upload(receipt, 10, 500, 'V-HOLD');
    await submitAndReview(invoiceId);
    const held = await request(http)
      .post(`/api/v1/invoices/${invoiceId}/hold`)
      .set('Authorization', `Bearer ${accounts}`)
      .send({ holdReason: 'Waiting for vendor clarification' })
      .expect(201);
    expect(held.body.data.status).toBe('ON_HOLD');
    expect(held.body.data.matchStatus).toBe('HOLD');
    const view = await request(http)
      .get(`/api/v1/invoices/${invoiceId}/accounts-view`)
      .set('Authorization', `Bearer ${accounts}`)
      .expect(200);
    expect(view.body.data.purchaseOrder.poNumber).toBeDefined();
    expect(view.body.data.grns.length).toBe(1);
    const released = await request(http)
      .post(`/api/v1/invoices/${invoiceId}/release-hold`)
      .set('Authorization', `Bearer ${accounts}`)
      .expect(201);
    expect(released.body.data.status).toBe('ACCOUNTS_REVIEW');
    await request(http)
      .get(`/api/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    const rejected = await request(http)
      .post(`/api/v1/invoices/${invoiceId}/reject`)
      .set('Authorization', `Bearer ${accounts}`)
      .send({ reason: 'Vendor invoice is not acceptable' })
      .expect(201);
    expect(rejected.body.data.status).toBe('REJECTED');
  });

  async function upload(
    receipt: {
      poId: string;
      vendorId: string;
      itemId: string;
      grnIds: string[];
    },
    quantity: number,
    total: number,
    vendorInvoiceNumber: string,
  ) {
    const created = await request(http)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        vendorInvoiceNumber,
        invoiceDate: '2026-09-20',
        vendorId: receipt.vendorId,
        purchaseOrderId: receipt.poId,
        grnIds: receipt.grnIds,
        totalAmount: total,
        invoiceItems: [
          {
            purchaseOrderItemId: receipt.itemId,
            invoicedQuantity: quantity,
            unitPrice: total / quantity,
          },
        ],
        attachments: [
          {
            fileName: 'invoice.pdf',
            mimeType: 'application/pdf',
            size: 1200,
            storageKey: `invoices/${vendorInvoiceNumber}.pdf`,
          },
        ],
      })
      .expect(201);
    expect(created.body.data.invoiceNumber).toMatch(/^INV-\d{4}-\d{5}$/);
    return created.body.data._id as string;
  }

  async function submitAndReview(invoiceId: string) {
    await request(http)
      .post(`/api/v1/invoices/${invoiceId}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    const reviewed = await request(http)
      .post(`/api/v1/invoices/${invoiceId}/review`)
      .set('Authorization', `Bearer ${accounts}`)
      .send({})
      .expect(201);
    expect(reviewed.body.data.status).toBe('ACCOUNTS_REVIEW');
  }

  async function openReceipt(
    quantity: number,
    rate: number,
    receipts: number[],
  ) {
    const approvalId = await seedApproval(quantity, rate);
    const po = await request(http)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ purchaseApprovalId: approvalId })
      .expect(201);
    const poId = po.body.data._id as string;
    const vendorId = po.body.data.vendorId as string;
    await approvePo(poId);
    const items = await request(http)
      .get(`/api/v1/purchase-orders/${poId}/items`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const itemId = items.body.data[0]._id as string;
    const grnIds: string[] = [];
    for (const received of receipts) {
      const deliveryId = await ship(poId, itemId, received);
      grnIds.push(await receive(poId, deliveryId, itemId, received));
    }
    return { poId, vendorId, itemId, grnIds };
  }

  async function winProject(token: string) {
    const lead = await request(http)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyName: 'Phase 7 Client',
        contactPerson: 'Meera',
        email: 'meera@phase7.local',
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
        title: 'Phase 7 package',
        clientName: 'Phase 7 Client',
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
        description: 'Cement',
        location: 'Chennai',
        items: [
          {
            description: 'Cement',
            unit: 'bag',
            quantity: 100,
            estimatedRate: 100,
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
            rate: 100,
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

  async function seedApproval(quantity: number, rate: number) {
    const tenantId = new Types.ObjectId(tenantA);
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
      description: 'Cement',
      quantity,
      unitRate: rate,
      discount: 0,
      taxRate: 0,
    });
    const approval = await approvals.create({
      tenantId,
      status: 'APPROVED',
      procurementRequestId: procurement._id,
      comparisonStatementId: comparison._id,
      vendorSelectionId: selection._id,
      projectId: project,
      siteId: site,
      vendorId: vendor._id,
    });
    return approval._id.toString();
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
    await request(http)
      .post(`/api/v1/purchase-orders/${poId}/send-to-vendor`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    await request(http)
      .post(`/api/v1/purchase-orders/${poId}/acknowledge`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ acknowledgedAt: '2026-09-02T10:00:00.000Z' })
      .expect(201);
  }

  async function ship(poId: string, itemId: string, quantity: number) {
    const created = await request(http)
      .post(`/api/v1/purchase-orders/${poId}/deliveries`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        deliveryDate: '2026-09-05',
        vehicleNumber: 'TN07P7001',
        driverName: 'Ravi',
        driverPhone: '9000000001',
        challanNumber: `P7-${new Types.ObjectId().toString()}`,
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

  async function receive(
    poId: string,
    deliveryId: string,
    itemId: string,
    quantity: number,
  ) {
    const created = await request(http)
      .post(`/api/v1/purchase-orders/${poId}/grns`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        deliveryId,
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
    const id = created.body.data._id as string;
    await request(http)
      .post(`/api/v1/grns/${id}/submit`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    await request(http)
      .post(`/api/v1/grns/${id}/approve`)
      .set('Authorization', `Bearer ${head}`)
      .expect(201);
    return id;
  }
});

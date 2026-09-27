/**
 * Loads a walkthrough dataset for Tenant A without wiping users.
 * Safe to run again: existing demo numbers are left in place.
 */
const { config } = require('dotenv');
const mongoose = require('mongoose');
const { seedInvoiceSamples } = require('../dist/database/seed/invoice-samples');

config();

async function upsert(collection, filter, doc) {
  await collection.updateOne(
    filter,
    { $setOnInsert: { ...doc, createdAt: new Date(), updatedAt: new Date() } },
    { upsert: true },
  );
  return collection.findOne(filter);
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection;
  const tenant = await db.collection('tenants').findOne({ code: 'TENANTA' });
  const admin = await db.collection('users').findOne({
    email: 'admin.a@tenant-a.local',
  });
  if (!tenant || !admin) {
    throw new Error('Tenant A admin was not found');
  }

  const tenantId = tenant._id;
  const userId = admin._id;
  const already = await db.collection('projects').findOne({
    tenantId,
    projectNumber: 'PRJ-SEED-00001',
  });
  if (!already) {
    await seedInvoiceSamples({
      tenantId,
      userId,
      accountsUserId: userId,
    });
  }

  const project = await db.collection('projects').findOne({
    tenantId,
    projectNumber: 'PRJ-SEED-00001',
  });
  const site = await db.collection('sites').findOne({
    tenantId,
    code: 'SEED-SITE',
  });
  const order = await db.collection('purchase_orders').findOne({
    tenantId,
    poNumber: 'PO-SEED-00001',
  });
  const vendor = await db.collection('vendors').findOne({
    tenantId,
    name: 'Seed Cement Supplies',
  });
  if (!project || !site || !order || !vendor) {
    throw new Error('Invoice sample project, site, PO, or vendor is missing');
  }

  const category = await upsert(
    db.collection('material_categories'),
    { tenantId, code: 'CIVIL' },
    { tenantId, code: 'CIVIL', name: 'Civil', status: 'ACTIVE', customFields: {} },
  );
  const unit = await upsert(
    db.collection('units_of_measure'),
    { tenantId, code: 'BAG' },
    { tenantId, code: 'BAG', name: 'Bag', symbol: 'bag', status: 'ACTIVE' },
  );
  for (const material of [
    { materialCode: 'CEMENT', name: 'Cement', defaultRate: 100 },
    { materialCode: 'SAND', name: 'Sand', defaultRate: 100 },
    { materialCode: 'AGGREGATE', name: 'Aggregate', defaultRate: 100 },
  ]) {
    await upsert(
      db.collection('materials'),
      { tenantId, materialCode: material.materialCode },
      {
        tenantId,
        ...material,
        categoryId: category._id,
        unitId: unit._id,
        taxRate: 18,
        status: 'ACTIVE',
        customFields: {},
        createdBy: userId,
      },
    );
  }

  const employee = await upsert(
    db.collection('employees'),
    { tenantId, employeeCode: 'EMP-ADMIN' },
    {
      tenantId,
      employeeCode: 'EMP-ADMIN',
      userId,
      name: 'Tenant Admin A',
      email: 'admin.a@tenant-a.local',
      phone: '+910000000011',
      department: 'Projects',
      designation: 'Tenant Admin',
      status: 'ACTIVE',
      joiningDate: new Date('2026-01-01'),
      customFields: {},
    },
  );
  await upsert(
    db.collection('attendance'),
    {
      tenantId,
      employeeId: employee._id,
      siteId: site._id,
      attendanceDate: '2026-09-26',
    },
    {
      tenantId,
      employeeId: employee._id,
      siteId: site._id,
      projectId: project._id,
      attendanceDate: '2026-09-26',
      firstPunchIn: new Date('2026-09-26T03:30:00.000Z'),
      lastPunchOut: new Date('2026-09-26T12:30:00.000Z'),
      totalWorkedMinutes: 540,
      status: 'PRESENT',
    },
  );

  const tender = await upsert(
    db.collection('tenders'),
    { tenantId, tenderNumber: 'TND-SEED-00001' },
    {
      tenantId,
      tenderNumber: 'TND-SEED-00001',
      title: 'Seed Tower tender',
      clientName: 'Seed Client',
      referenceNumber: 'CLIENT-TND-19',
      issueDate: new Date('2026-08-01'),
      submissionDate: new Date('2026-08-20'),
      estimatedValue: 2500000,
      description: 'Civil package for Seed Tower',
      status: 'WON',
      owner: userId,
      createdBy: userId,
      customFields: {},
    },
  );
  await upsert(
    db.collection('quotations'),
    { tenantId, quotationNumber: 'QT-SEED-00001' },
    {
      tenantId,
      quotationNumber: 'QT-SEED-00001',
      tenderId: tender._id,
      version: 1,
      isCurrent: true,
      quotationDate: new Date('2026-08-18'),
      validUntil: new Date('2026-09-18'),
      subtotal: 2500000,
      discount: 0,
      tax: 450000,
      total: 2950000,
      currency: 'INR',
      paymentTerms: '30 days',
      status: 'ACCEPTED',
      items: [],
      customFields: {},
      createdBy: userId,
    },
  );
  await upsert(
    db.collection('leads'),
    { tenantId, leadNumber: 'LD-SEED-00001' },
    {
      tenantId,
      leadNumber: 'LD-SEED-00001',
      companyName: 'Harbour Estates',
      contactPerson: 'Meera Nair',
      email: 'meera@harbour.example',
      phone: '+910000000099',
      source: 'Referral',
      description: 'New commercial block enquiry',
      status: 'QUALIFIED',
      owner: userId,
      estimatedValue: 1800000,
      createdBy: userId,
      customFields: {},
    },
  );

  await upsert(
    db.collection('deliveries'),
    { tenantId, deliveryNumber: 'DLV-SEED-00001' },
    {
      tenantId,
      deliveryNumber: 'DLV-SEED-00001',
      purchaseOrderId: order._id,
      vendorId: vendor._id,
      projectId: project._id,
      siteId: site._id,
      deliveryDate: new Date('2026-09-10'),
      expectedDate: new Date('2026-09-10'),
      status: 'DELIVERED',
      vehicleNumber: 'TN01AB1234',
      driverName: 'Ravi',
      challanNumber: 'CH-1001',
      attachments: [],
      createdBy: userId,
    },
  );

  const boq = await upsert(
    db.collection('boqs'),
    { tenantId, boqNumber: 'BOQ-SEED-00001' },
    {
      tenantId,
      projectId: project._id,
      boqNumber: 'BOQ-SEED-00001',
      version: 1,
      status: 'APPROVED',
      description: 'Seed Tower civil BOQ',
      totalAmount: 17000,
      customFields: {},
      approvedAt: new Date('2026-08-25'),
      approvedBy: userId,
      createdBy: userId,
    },
  );
  await upsert(
    db.collection('material_requests'),
    { tenantId, requestNumber: 'MR-SEED-00001' },
    {
      tenantId,
      requestNumber: 'MR-SEED-00001',
      projectId: project._id,
      siteId: site._id,
      boqId: boq._id,
      requestDate: new Date('2026-09-01'),
      requiredDate: new Date('2026-09-08'),
      requestedBy: userId,
      remarks: 'Cement and sand for the ground floor',
      status: 'APPROVED',
      exceptionStatus: 'NORMAL',
      exceptionPercentage: 0,
      customFields: {},
      createdBy: userId,
    },
  );

  const submitted = await upsert(
    db.collection('invoices'),
    { tenantId, invoiceNumber: 'INV-SEED-SUBMITTED' },
    {
      tenantId,
      invoiceNumber: 'INV-SEED-SUBMITTED',
      vendorInvoiceNumber: 'VEND-SUBMIT-001',
      invoiceDate: new Date('2026-09-20'),
      dueDate: new Date('2026-10-20'),
      vendorId: vendor._id,
      vendorName: 'Seed Cement Supplies',
      purchaseOrderId: order._id,
      poNumber: order.poNumber,
      projectId: project._id,
      siteId: site._id,
      currency: 'INR',
      subtotal: 2000,
      taxAmount: 0,
      discountAmount: 0,
      additionalCharges: 0,
      totalAmount: 2000,
      status: 'SUBMITTED',
      matchStatus: 'PENDING',
      paymentTerms: '30 days',
      createdBy: userId,
      attachments: [],
    },
  );
  await upsert(
    db.collection('invoices'),
    { tenantId, invoiceNumber: 'INV-SEED-REVIEW' },
    {
      tenantId,
      invoiceNumber: 'INV-SEED-REVIEW',
      vendorInvoiceNumber: 'VEND-REVIEW-001',
      invoiceDate: new Date('2026-09-18'),
      dueDate: new Date('2026-10-18'),
      vendorId: vendor._id,
      vendorName: 'Seed Cement Supplies',
      purchaseOrderId: order._id,
      poNumber: order.poNumber,
      projectId: project._id,
      siteId: site._id,
      currency: 'INR',
      subtotal: 2000,
      taxAmount: 0,
      discountAmount: 0,
      additionalCharges: 0,
      totalAmount: 2000,
      status: 'ACCOUNTS_REVIEW',
      matchStatus: 'PENDING',
      paymentTerms: '30 days',
      createdBy: userId,
      attachments: [],
    },
  );

  const counts = {};
  for (const name of [
    'projects',
    'sites',
    'materials',
    'employees',
    'attendance',
    'tenders',
    'quotations',
    'leads',
    'purchase_orders',
    'deliveries',
    'grns',
    'boqs',
    'material_requests',
    'invoices',
  ]) {
    counts[name] = await db.collection(name).countDocuments({ tenantId });
  }
  console.log(JSON.stringify({ submitted: submitted.invoiceNumber, counts }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

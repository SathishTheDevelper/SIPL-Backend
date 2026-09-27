import mongoose, { Types } from 'mongoose';
import { ProjectType } from '../../business-development/requirements/enums/requirement.enums';
import { GrnStatus } from '../../grn/enums/grn.enums';
import { GrnItemSchema } from '../../grn/schemas/grn-item.schema';
import { GrnSchema } from '../../grn/schemas/grn.schema';
import { InvoiceMatchStatus } from '../../invoices/enums/invoice-match-status.enum';
import { InvoiceReferenceType } from '../../invoices/enums/invoice-reference-type.enum';
import { InvoiceStatus } from '../../invoices/enums/invoice-status.enum';
import { InvoiceItemSchema } from '../../invoices/schemas/invoice-item.schema';
import { InvoiceReferenceSchema } from '../../invoices/schemas/invoice-reference.schema';
import { InvoiceSchema } from '../../invoices/schemas/invoice.schema';
import { ProjectStatus } from '../../projects/enums/project.enums';
import { ProjectSchema } from '../../projects/schemas/project.schema';
import { PurchaseOrderStatus } from '../../purchase-orders/enums/purchase-order.enums';
import { PurchaseOrderItemSchema } from '../../purchase-orders/schemas/purchase-order-item.schema';
import { PurchaseOrderSchema } from '../../purchase-orders/schemas/purchase-order.schema';
import { VendorSourceSchema } from '../../purchase-orders/schemas/upstream.schema';
import { SiteStatus } from '../../sites/enums/site-status.enum';
import { SiteSchema } from '../../sites/schemas/site.schema';

function modelOf<T>(name: string, schema: mongoose.Schema) {
  return (
    (mongoose.models[name] as mongoose.Model<T>) ||
    mongoose.model<T>(name, schema)
  );
}

export async function seedInvoiceSamples(input: {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  accountsUserId: Types.ObjectId;
}) {
  const Vendor = modelOf('VendorSource', VendorSourceSchema);
  const Project = modelOf('Project', ProjectSchema);
  const Site = modelOf('Site', SiteSchema);
  const Order = modelOf('PurchaseOrder', PurchaseOrderSchema);
  const OrderItem = modelOf('PurchaseOrderItem', PurchaseOrderItemSchema);
  const Grn = modelOf('Grn', GrnSchema);
  const GrnItem = modelOf('GrnItem', GrnItemSchema);
  const Invoice = modelOf('Invoice', InvoiceSchema);
  const InvoiceItem = modelOf('InvoiceItem', InvoiceItemSchema);
  const Reference = modelOf('InvoiceReference', InvoiceReferenceSchema);

  const tenantId = input.tenantId;
  const materialA = new Types.ObjectId();
  const materialB = new Types.ObjectId();
  const materialC = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const vendor = await Vendor.create({
    tenantId,
    name: 'Seed Cement Supplies',
    status: 'ACTIVE',
  });
  const project = await Project.create({
    tenantId,
    projectNumber: 'PRJ-SEED-00001',
    name: 'Seed Tower',
    clientName: 'Seed Client',
    tenderId: new Types.ObjectId(),
    quotationId: new Types.ObjectId(),
    clientDecisionId: new Types.ObjectId(),
    projectType: ProjectType.CIVIL,
    status: ProjectStatus.ACTIVE,
    currency: 'INR',
    projectHead: input.userId,
    createdBy: input.userId,
  });
  const site = await Site.create({
    tenantId,
    projectId: project._id,
    name: 'Seed Site',
    code: 'SEED-SITE',
    latitude: 13.0827,
    longitude: 80.2707,
    geofenceRadius: 100,
    location: { type: 'Point', coordinates: [80.2707, 13.0827] },
    status: SiteStatus.ACTIVE,
    createdBy: input.userId,
  });
  const order = await Order.create({
    tenantId,
    poNumber: 'PO-SEED-00001',
    purchaseApprovalId: new Types.ObjectId(),
    procurementRequestId: new Types.ObjectId(),
    comparisonStatementId: new Types.ObjectId(),
    vendorSelectionId: new Types.ObjectId(),
    projectId: project._id,
    siteId: site._id,
    vendorId: vendor._id,
    poDate: new Date('2026-09-01'),
    currency: 'INR',
    paymentTerms: '30 days',
    subtotal: 17000,
    discount: 0,
    taxAmount: 0,
    additionalChargesTotal: 0,
    grandTotal: 17000,
    status: PurchaseOrderStatus.PARTIALLY_DELIVERED,
    createdBy: input.userId,
  });
  const items = await OrderItem.create([
    {
      tenantId,
      purchaseOrderId: order._id,
      materialId: materialA,
      description: 'Cement',
      quantity: 100,
      receivedQuantity: 70,
      pendingQuantity: 30,
      unitId,
      unitRate: 100,
      discount: 0,
      taxRate: 0,
      taxAmount: 0,
      lineTotal: 10000,
    },
    {
      tenantId,
      purchaseOrderId: order._id,
      materialId: materialB,
      description: 'Sand',
      quantity: 50,
      receivedQuantity: 20,
      pendingQuantity: 30,
      unitId,
      unitRate: 100,
      discount: 0,
      taxRate: 0,
      taxAmount: 0,
      lineTotal: 5000,
    },
    {
      tenantId,
      purchaseOrderId: order._id,
      materialId: materialC,
      description: 'Aggregate',
      quantity: 20,
      receivedQuantity: 0,
      pendingQuantity: 20,
      unitId,
      unitRate: 100,
      discount: 0,
      taxRate: 0,
      taxAmount: 0,
      lineTotal: 2000,
    },
  ]);
  const deliveryId = new Types.ObjectId();
  const grnOne = await Grn.create({
    tenantId,
    grnNumber: 'GRN-SEED-00001',
    purchaseOrderId: order._id,
    deliveryId,
    projectId: project._id,
    siteId: site._id,
    vendorId: vendor._id,
    grnDate: new Date('2026-09-10'),
    receivedBy: input.userId,
    status: GrnStatus.APPROVED,
    createdBy: input.userId,
  });
  const grnTwo = await Grn.create({
    tenantId,
    grnNumber: 'GRN-SEED-00002',
    purchaseOrderId: order._id,
    deliveryId: new Types.ObjectId(),
    projectId: project._id,
    siteId: site._id,
    vendorId: vendor._id,
    grnDate: new Date('2026-09-12'),
    receivedBy: input.userId,
    status: GrnStatus.APPROVED,
    createdBy: input.userId,
  });
  await GrnItem.create([
    {
      tenantId,
      grnId: grnOne._id,
      purchaseOrderItemId: items[0]._id,
      materialId: materialA,
      orderedQuantity: 100,
      previouslyReceivedQuantity: 0,
      receivedQuantity: 40,
      acceptedQuantity: 40,
      rejectedQuantity: 0,
      unitId,
    },
    {
      tenantId,
      grnId: grnTwo._id,
      purchaseOrderItemId: items[0]._id,
      materialId: materialA,
      orderedQuantity: 100,
      previouslyReceivedQuantity: 40,
      receivedQuantity: 30,
      acceptedQuantity: 30,
      rejectedQuantity: 0,
      unitId,
    },
  ]);

  const samples = [
    {
      number: 'INV-SEED-MATCH',
      vendorNumber: 'VEND-MATCH-001',
      status: InvoiceStatus.MATCHED,
      matchStatus: InvoiceMatchStatus.MATCH,
      item: items[0],
      quantity: 70,
      amount: 7000,
      holdReason: undefined as string | undefined,
    },
    {
      number: 'INV-SEED-MISMATCH',
      vendorNumber: 'VEND-MISMATCH-001',
      status: InvoiceStatus.MISMATCH,
      matchStatus: InvoiceMatchStatus.MISMATCH,
      item: items[0],
      quantity: 100,
      amount: 10000,
      holdReason: undefined as string | undefined,
    },
    {
      number: 'INV-SEED-HOLD',
      vendorNumber: 'VEND-HOLD-001',
      status: InvoiceStatus.ON_HOLD,
      matchStatus: InvoiceMatchStatus.HOLD,
      item: items[1],
      quantity: 10,
      amount: 1000,
      holdReason: 'Waiting for vendor clarification',
    },
  ];

  for (const sample of samples) {
    const invoice = await Invoice.create({
      tenantId,
      invoiceNumber: sample.number,
      vendorInvoiceNumber: sample.vendorNumber,
      invoiceDate: new Date('2026-09-15'),
      dueDate: new Date('2026-10-15'),
      vendorId: vendor._id,
      vendorName: 'Seed Cement Supplies',
      purchaseOrderId: order._id,
      poNumber: order.poNumber,
      projectId: project._id,
      siteId: site._id,
      currency: 'INR',
      subtotal: sample.amount,
      taxAmount: 0,
      discountAmount: 0,
      additionalCharges: 0,
      totalAmount: sample.amount,
      status: sample.status,
      matchStatus: sample.matchStatus,
      paymentTerms: '30 days',
      holdReason: sample.holdReason,
      heldBy: sample.holdReason ? input.accountsUserId : undefined,
      heldAt: sample.holdReason ? new Date('2026-09-16') : undefined,
      createdBy: input.userId,
      attachments: [],
    });
    await InvoiceItem.create({
      tenantId,
      invoiceId: invoice._id,
      purchaseOrderItemId: sample.item._id,
      materialId: sample.item.materialId,
      description: sample.item.description,
      orderedQuantity: sample.item.quantity,
      invoicedQuantity: sample.quantity,
      receivedQuantity: sample.item.receivedQuantity,
      unit: 'UNIT',
      unitId,
      unitPrice: 100,
      taxRate: 0,
      taxAmount: 0,
      discountAmount: 0,
      lineAmount: sample.amount,
    });
    await Reference.create([
      {
        tenantId,
        invoiceId: invoice._id,
        purchaseOrderId: order._id,
        referenceType: InvoiceReferenceType.PO,
        referenceNumber: order.poNumber,
      },
      {
        tenantId,
        invoiceId: invoice._id,
        purchaseOrderId: order._id,
        grnId: grnOne._id,
        referenceType: InvoiceReferenceType.GRN,
        referenceNumber: grnOne.grnNumber,
      },
      {
        tenantId,
        invoiceId: invoice._id,
        purchaseOrderId: order._id,
        grnId: grnTwo._id,
        referenceType: InvoiceReferenceType.GRN,
        referenceNumber: grnTwo.grnNumber,
      },
    ]);
  }
}

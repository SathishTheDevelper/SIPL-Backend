import {
  TenantNumbering,
  TenantSettings,
  TenantSubscription,
} from './schemas/tenant.schema';
import { TenantStatus } from './enums/tenant-status.enum';

export function defaultNumbering(): TenantNumbering {
  const item = (prefix: string) => ({ prefix, padding: 5, includeYear: true });
  return {
    lead: item('LD'),
    opportunity: item('OP'),
    tender: item('TN'),
    project: item('PRJ'),
    materialRequest: item('MR'),
    boq: item('BOQ'),
    employee: item('EMP'),
    rfq: item('RFQ'),
    quotation: item('QT'),
    purchaseOrder: item('PO'),
    delivery: item('DLV'),
    grn: item('GRN'),
    invoice: item('INV'),
    payment: item('PAY'),
  };
}

export function defaultTenantSettings(): TenantSettings {
  return {
    geofenceRadiusMeters: 100,
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    financialYearStartMonth: 4,
    invoiceTolerancePercent: 0,
    invoiceToleranceAmount: 0,
    gstEnabled: true,
    defaultGstPercent: 18,
    defaultPaymentTermsDays: 30,
    workingDays: [1, 2, 3, 4, 5],
    workingStartTime: '09:00',
    workingEndTime: '18:00',
    slaHoursByModule: {
      MATERIAL_APPROVAL: 8,
      BOQ_APPROVAL: 8,
      SITE_ACCESS: 8,
      TENDER_APPROVAL: 16,
      PURCHASE_APPROVAL: 8,
      PO_APPROVAL: 8,
      GRN_APPROVAL: 8,
      INVOICE_ACCOUNTS_REVIEW: 8,
      INVOICE_APPROVAL: 8,
    },
    poApprovalLimits: [
      { roleCode: 'PROJECT_HEAD', maxAmount: 500000 },
      { roleCode: 'DIRECTOR', maxAmount: 2000000 },
      { roleCode: 'MD', maxAmount: 10000000 },
    ],
    approvalHierarchy: [],
    numbering: defaultNumbering(),
    notificationRecipients: {},
  };
}

export function defaultSubscription(): TenantSubscription {
  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setFullYear(endsAt.getFullYear() + 1);
  return {
    plan: 'standard',
    maxUsers: 50,
    maxProjects: 20,
    maxSites: 50,
    startsAt: now,
    endsAt,
    status: TenantStatus.ACTIVE,
  };
}

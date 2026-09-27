import { Types } from 'mongoose';
import { ErrorCodes } from '../../common/constants/error-codes';
import { TenantContext } from '../../common/context/tenant.context';
import { InvoiceMatchStatus } from '../enums/invoice-match-status.enum';
import { InvoiceStatus } from '../enums/invoice-status.enum';
import { InvoiceAccountsService } from './invoice-accounts.service';
import { InvoiceMatchService } from './invoice-match.service';

function lean(value: unknown) {
  return {
    lean: () => ({ exec: async () => value }),
    session: () => lean(value),
    sort: () => lean(value),
  };
}

describe('InvoiceAccountsService', () => {
  const invoiceId = new Types.ObjectId();
  const tenantId = new Types.ObjectId();

  function asTenant<T>(fn: () => Promise<T>) {
    return TenantContext.run(
      {
        tenantId: tenantId.toString(),
        userId: new Types.ObjectId().toString(),
        role: 'ACCOUNTS',
        permissions: [],
        isSuperAdmin: false,
      },
      fn,
    );
  }

  function accounts(
    status: InvoiceStatus,
    matchStatus = InvoiceMatchStatus.PENDING,
  ) {
    const current = {
      _id: invoiceId,
      tenantId,
      status,
      matchStatus,
      purchaseOrderId: new Types.ObjectId(),
      createdBy: new Types.ObjectId(),
      invoiceNumber: 'INV-2026-000001',
    };
    const updated = {
      ...current,
      status: InvoiceStatus.ON_HOLD,
      matchStatus: InvoiceMatchStatus.HOLD,
    };
    const invoices = {
      findOne: jest.fn().mockReturnValue(lean(current)),
      findOneAndUpdate: jest.fn().mockReturnValue(lean(updated)),
    };
    const events = {
      log: jest.fn(),
      audit: jest.fn(),
      notify: jest.fn(),
    };
    const service = new InvoiceAccountsService(
      invoices as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { requireInvoice: jest.fn().mockResolvedValue(current) } as never,
      events as never,
      { complete: jest.fn(), start: jest.fn() } as never,
      { act: jest.fn() } as never,
      { register: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, invoices, events, current };
  }

  it('places an invoice on hold with the reason', async () => {
    const { service, events } = accounts(InvoiceStatus.ACCOUNTS_REVIEW);
    const held = await asTenant(() =>
      service.hold(
        invoiceId.toString(),
        { holdReason: 'Waiting for vendor clarification' },
        {
          userId: new Types.ObjectId().toString(),
        } as never,
      ),
    );
    expect(held.matchStatus).toBe(InvoiceMatchStatus.HOLD);
    expect(events.audit).toHaveBeenCalled();
    expect(events.notify).toHaveBeenCalled();
  });

  it('does not approve a mismatch', async () => {
    const { service } = accounts(
      InvoiceStatus.MISMATCH,
      InvoiceMatchStatus.MISMATCH,
    );
    await expect(
      asTenant(() =>
        service.approve(invoiceId.toString(), { userId: 'user' } as never),
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.INVALID_INVOICE_STATUS });
  });

  it('releases a hold back to accounts review', async () => {
    const released = {
      _id: invoiceId,
      tenantId,
      status: InvoiceStatus.ACCOUNTS_REVIEW,
      matchStatus: InvoiceMatchStatus.PENDING,
      purchaseOrderId: new Types.ObjectId(),
      createdBy: new Types.ObjectId(),
      invoiceNumber: 'INV-2026-000001',
    };
    const { service, invoices } = accounts(
      InvoiceStatus.ON_HOLD,
      InvoiceMatchStatus.HOLD,
    );
    invoices.findOneAndUpdate.mockReturnValue(lean(released));
    const result = await asTenant(() =>
      service.releaseHold(invoiceId.toString(), {
        userId: new Types.ObjectId().toString(),
      } as never),
    );
    expect(result.status).toBe(InvoiceStatus.ACCOUNTS_REVIEW);
  });
});

describe('InvoiceMatchService', () => {
  it('returns the existing result when the same match is requested again', async () => {
    const invoiceId = new Types.ObjectId();
    const resultId = new Types.ObjectId();
    const invoice = {
      _id: invoiceId,
      tenantId: new Types.ObjectId(),
      status: InvoiceStatus.MATCHED,
      purchaseOrderId: new Types.ObjectId(),
    };
    const stored = {
      _id: resultId,
      invoiceId,
      purchaseOrderId: invoice.purchaseOrderId,
      grnIds: [],
      matchStatus: InvoiceMatchStatus.MATCH,
      matchedAt: new Date(),
      matchedBy: new Types.ObjectId(),
      poTotalAmount: 10000,
      invoiceTotalAmount: 9000,
      receivedTotalAmount: 9000,
      quantityVariance: 0,
      amountVariance: 0,
      toleranceApplied: { percent: 0, amount: 0 },
      lineResults: [],
      issues: [],
      summary: {
        poQuantity: 100,
        receivedQuantity: 90,
        invoiceQuantity: 90,
        previouslyInvoicedQuantity: 0,
        remainingInvoiceableQuantity: 100,
      },
      quantityMatched: true,
      amountMatched: true,
    };
    const results = {
      create: jest.fn(),
      findOne: jest.fn().mockReturnValue({
        sort: () => ({ lean: () => ({ exec: async () => stored }) }),
      }),
    };
    const service = new InvoiceMatchService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      results as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { requireInvoice: jest.fn().mockResolvedValue(invoice) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { setIfAbsent: jest.fn(), del: jest.fn() } as never,
    );
    const response = await TenantContext.run(
      {
        tenantId: invoice.tenantId.toString(),
        userId: 'user',
        role: 'ACCOUNTS',
        permissions: [],
        isSuperAdmin: false,
      },
      () =>
        service.runThreeWayMatch(invoiceId.toString(), {
          userId: 'user',
        } as never),
    );
    expect(response.status).toBe('MATCH');
    expect(results.create).not.toHaveBeenCalled();
  });

  it('refuses to match an approved invoice', async () => {
    const service = new InvoiceMatchService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        requireInvoice: jest.fn().mockResolvedValue({
          status: InvoiceStatus.APPROVED,
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.runThreeWayMatch(new Types.ObjectId().toString(), {
        userId: 'user',
      } as never),
    ).rejects.toMatchObject({ errorCode: ErrorCodes.INVOICE_ALREADY_APPROVED });
  });
});

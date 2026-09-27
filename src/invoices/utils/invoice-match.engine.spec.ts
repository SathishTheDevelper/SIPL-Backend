import {
  CONSUMED_INVOICE_STATUSES,
  InvoiceStatus,
} from '../enums/invoice-status.enum';
import { EngineLineInput } from '../interfaces/invoice-match-result.interface';
import {
  amountWithinTolerance,
  evaluateThreeWayMatch,
} from '../utils/invoice-match.engine';
import { assertInvoiceTransition } from '../utils/invoice-status';
import { AppException } from '../../common/exceptions/app.exception';

function line(overrides: Partial<EngineLineInput> = {}): EngineLineInput {
  return {
    invoiceItemId: 'line-1',
    purchaseOrderItemId: 'po-item-1',
    poQuantity: 100,
    receivedQuantity: 90,
    previouslyInvoicedQuantity: 0,
    invoiceQuantity: 90,
    poUnitPrice: 100,
    invoiceUnitPrice: 100,
    poDiscount: 0,
    poTaxRate: 0,
    invoiceAmount: 9000,
    ...overrides,
  };
}

function evaluate(
  overrides: Partial<EngineLineInput> = {},
  tolerance = { percent: 0, amount: 0 },
) {
  const row = line(overrides);
  return evaluateThreeWayMatch({
    lines: [row],
    invoiceTotalAmount: row.invoiceAmount,
    poTotalAmount: 10000,
    additionalCharges: 0,
    tolerance,
  });
}

describe('InvoiceMatchService rules', () => {
  it('matches a partial receipt when the invoice equals the GRN quantity', () => {
    const result = evaluate();
    expect(result.status).toBe('MATCH');
    expect(result.quantityMatched).toBe(true);
    expect(result.amountMatched).toBe(true);
    expect(result.summary).toMatchObject({
      poQuantity: 100,
      receivedQuantity: 90,
      invoiceQuantity: 90,
      previouslyInvoicedQuantity: 0,
      remainingInvoiceableQuantity: 100,
    });
    expect(result.issues).toEqual([]);
  });

  it('mismatches when the invoice quantity exceeds the received quantity', () => {
    const result = evaluate({ invoiceQuantity: 100, invoiceAmount: 10000 });
    expect(result.status).toBe('MISMATCH');
    expect(result.quantityMatched).toBe(false);
    expect(result.issues[0]).toMatchObject({
      type: 'QUANTITY_MISMATCH',
      message: 'Invoice quantity exceeds received quantity',
    });
  });

  it('matches the combined quantity of multiple GRNs', () => {
    const result = evaluate({
      receivedQuantity: 70,
      invoiceQuantity: 70,
      invoiceAmount: 7000,
    });
    expect(result.status).toBe('MATCH');
    expect(result.summary.receivedQuantity).toBe(70);
    expect(result.summary.invoiceQuantity).toBe(70);
  });

  it('matches a later invoice against the remaining quantity', () => {
    const result = evaluate({
      receivedQuantity: 100,
      previouslyInvoicedQuantity: 60,
      invoiceQuantity: 40,
      invoiceAmount: 4000,
    });
    expect(result.status).toBe('MATCH');
    expect(result.summary.remainingInvoiceableQuantity).toBe(40);
  });

  it('mismatches when a new invoice exceeds the remaining quantity', () => {
    const result = evaluate({
      receivedQuantity: 100,
      previouslyInvoicedQuantity: 60,
      invoiceQuantity: 50,
      invoiceAmount: 5000,
    });
    expect(result.status).toBe('MISMATCH');
    expect(result.issues.map((issue) => issue.message)).toContain(
      'Invoice quantity exceeds remaining invoiceable quantity',
    );
  });

  it('uses the tenant tolerance and does not hard-code 2 percent', () => {
    const over = evaluateThreeWayMatch({
      lines: [
        line({
          poQuantity: 100,
          receivedQuantity: 100,
          invoiceQuantity: 100,
          poUnitPrice: 1000,
          invoiceUnitPrice: 1025,
          invoiceAmount: 102500,
        }),
      ],
      invoiceTotalAmount: 102500,
      poTotalAmount: 100000,
      additionalCharges: 0,
      tolerance: { percent: 2, amount: 0 },
    });
    expect(over.status).toBe('MISMATCH');
    expect(over.amountMatched).toBe(false);

    const inside = evaluateThreeWayMatch({
      lines: [
        line({
          poQuantity: 100,
          receivedQuantity: 100,
          invoiceQuantity: 100,
          poUnitPrice: 1000,
          invoiceUnitPrice: 1010,
          invoiceAmount: 101000,
        }),
      ],
      invoiceTotalAmount: 101000,
      poTotalAmount: 100000,
      additionalCharges: 0,
      tolerance: { percent: 2, amount: 0 },
    });
    expect(inside.status).toBe('MATCH');
  });

  it('accepts an absolute tolerance amount from tenant settings', () => {
    expect(
      amountWithinTolerance(100000, 100050, { percent: 0, amount: 100 }),
    ).toBe(true);
    expect(
      amountWithinTolerance(100000, 100500, { percent: 0, amount: 100 }),
    ).toBe(false);
  });

  it('does not count rejected or cancelled invoices as consumed quantity', () => {
    expect(CONSUMED_INVOICE_STATUSES).toEqual([
      InvoiceStatus.MATCHED,
      InvoiceStatus.APPROVED,
    ]);
    expect(CONSUMED_INVOICE_STATUSES).not.toContain(InvoiceStatus.REJECTED);
    expect(CONSUMED_INVOICE_STATUSES).not.toContain(InvoiceStatus.CANCELLED);
  });

  it('never treats a quantity or amount mismatch as a match', () => {
    const result = evaluate({ invoiceQuantity: 100, invoiceAmount: 10000 });
    expect(result.status).not.toBe('MATCH');
  });
});

describe('InvoiceService status rules', () => {
  it('blocks mismatch from moving directly to approved', () => {
    expect(() =>
      assertInvoiceTransition(InvoiceStatus.MISMATCH, InvoiceStatus.APPROVED),
    ).toThrow(AppException);
  });

  it('allows the documented review and match transitions', () => {
    expect(() =>
      assertInvoiceTransition(InvoiceStatus.DRAFT, InvoiceStatus.SUBMITTED),
    ).not.toThrow();
    expect(() =>
      assertInvoiceTransition(
        InvoiceStatus.SUBMITTED,
        InvoiceStatus.ACCOUNTS_REVIEW,
      ),
    ).not.toThrow();
    expect(() =>
      assertInvoiceTransition(
        InvoiceStatus.ACCOUNTS_REVIEW,
        InvoiceStatus.MATCH_PENDING,
      ),
    ).not.toThrow();
    expect(() =>
      assertInvoiceTransition(
        InvoiceStatus.MATCH_PENDING,
        InvoiceStatus.MATCHED,
      ),
    ).not.toThrow();
    expect(() =>
      assertInvoiceTransition(InvoiceStatus.MATCHED, InvoiceStatus.APPROVED),
    ).not.toThrow();
  });
});

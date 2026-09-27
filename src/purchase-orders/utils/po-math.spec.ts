import {
  calculatePurchaseOrderTotals,
  exceedsReceipt,
  fromMilli,
  pendingMilli,
  quantitiesBalance,
  toMilli,
} from './po-math';

describe('purchase order money and quantity', () => {
  it('sums additional charges 5000 + 10000 + 7000 on a 100000 subtotal', () => {
    const totals = calculatePurchaseOrderTotals(
      [{ quantity: 100, unitRate: 1000 }],
      [{ amount: 5000 }, { amount: 10000 }, { amount: 7000 }],
    );
    expect(totals.subtotal).toBe(100000);
    expect(totals.items[0].lineTotal).toBe(100000);
    expect(totals.additionalChargesTotal).toBe(22000);
    expect(totals.taxAmount).toBe(0);
    expect(totals.discount).toBe(0);
    expect(totals.grandTotal).toBe(122000);
    expect(totals.charges.map((charge) => charge.totalAmount)).toEqual([
      5000, 10000, 7000,
    ]);
  });

  it('applies line discount and tax in integer minor units', () => {
    const totals = calculatePurchaseOrderTotals(
      [{ quantity: 2, unitRate: 100, discount: 10, taxRate: 18 }],
      [{ amount: 50, taxRate: 18 }],
      5,
    );
    expect(totals.subtotal).toBe(200);
    expect(totals.discount).toBe(15);
    expect(totals.taxAmount).toBe(43.2);
    expect(totals.additionalChargesTotal).toBe(50);
    expect(totals.grandTotal).toBe(278.2);
  });

  it('computes pending quantity as ordered minus received', () => {
    expect(fromMilli(pendingMilli(100, 40))).toBe(60);
    expect(fromMilli(pendingMilli(100, 0))).toBe(100);
    expect(fromMilli(pendingMilli(100, 100))).toBe(0);
  });

  it('rejects over-receipt unless a tenant tolerance is configured', () => {
    expect(exceedsReceipt(100, 40, 61)).toBe(true);
    expect(exceedsReceipt(100, 40, 60)).toBe(false);
    expect(exceedsReceipt(100, 0, 101)).toBe(true);
    expect(exceedsReceipt(100, 100, 5, 10)).toBe(false);
    expect(exceedsReceipt(100, 100, 11, 10)).toBe(true);
    expect(toMilli(40) + toMilli(30) + toMilli(30)).toBe(toMilli(100));
  });

  it('requires accepted and rejected quantities to equal received', () => {
    expect(quantitiesBalance(40, 30, 10)).toBe(true);
    expect(quantitiesBalance(40, 40, 0)).toBe(true);
    expect(quantitiesBalance(40, 30, 5)).toBe(false);
  });
});

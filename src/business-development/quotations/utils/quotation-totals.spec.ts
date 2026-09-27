import { calculateQuotationTotals } from './quotation-totals';

describe('calculateQuotationTotals', () => {
  it('computes subtotal, tax and grand total on the backend', () => {
    const result = calculateQuotationTotals(
      [
        { description: 'Civil work', quantity: 10, rate: 100, taxRate: 18 },
        {
          description: 'Discounted',
          quantity: 2,
          rate: 50,
          discount: 20,
          taxRate: 0,
        },
      ],
      10,
    );
    expect(result.subtotal).toBe(1100);
    expect(result.discount).toBe(30);
    expect(result.tax).toBe(180);
    expect(result.total).toBe(1250);
    expect(result.items[0].amount).toBe(1180);
    expect(result.items[1].amount).toBe(80);
  });

  it('does not trust a client-supplied total', () => {
    const result = calculateQuotationTotals([
      { description: 'A', quantity: 1, rate: 100 },
    ]);
    expect(result.total).toBe(100);
    expect(result.total).not.toBe(999);
  });
});

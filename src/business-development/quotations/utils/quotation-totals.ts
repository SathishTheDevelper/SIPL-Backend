export interface QuotationLineInput {
  description: string;
  quantity: number;
  unit?: string;
  rate: number;
  discount?: number;
  taxRate?: number;
  remarks?: string;
  customFields?: Record<string, unknown>;
}

export interface ComputedQuotationLine extends QuotationLineInput {
  discount: number;
  taxRate: number;
  taxAmount: number;
  amount: number;
}

export interface QuotationTotals {
  items: ComputedQuotationLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export function calculateQuotationTotals(
  items: QuotationLineInput[],
  headerDiscount = 0,
): QuotationTotals {
  let subtotal = 0;
  let lineDiscount = 0;
  let tax = 0;
  const computed = items.map((item) => {
    const quantity = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    const discount = Number(item.discount) || 0;
    const taxRate = Number(item.taxRate) || 0;
    const lineGross = quantity * rate;
    const taxable = Math.max(lineGross - discount, 0);
    const taxAmount = Number(((taxable * taxRate) / 100).toFixed(2));
    const amount = Number((taxable + taxAmount).toFixed(2));
    subtotal += lineGross;
    lineDiscount += discount;
    tax += taxAmount;
    return {
      ...item,
      quantity,
      rate,
      discount,
      taxRate,
      taxAmount,
      amount,
    };
  });
  const discount = Number((headerDiscount + lineDiscount).toFixed(2));
  const total = Number((subtotal - discount + tax).toFixed(2));
  return {
    items: computed,
    subtotal: Number(subtotal.toFixed(2)),
    discount,
    tax: Number(tax.toFixed(2)),
    total,
  };
}

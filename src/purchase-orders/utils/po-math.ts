const MONEY_SCALE = 100;
const QTY_SCALE = 1000;

export function toMinor(value: number | string): number {
  const raw = typeof value === 'number' ? String(value) : value.trim();
  if (!raw || raw === 'NaN') {
    throw new Error('Invalid amount');
  }
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  if (!/^\d+(\.\d+)?$/.test(unsigned)) {
    throw new Error('Invalid amount');
  }
  const [whole, frac = ''] = unsigned.split('.');
  const digits = (frac + '000').slice(0, 3);
  const extended = Number(whole) * 1000 + Number(digits);
  const minor = Math.round(extended / 10);
  return negative ? -minor : minor;
}

export function fromMinor(minor: number): number {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.trunc(abs / MONEY_SCALE);
  const frac = String(abs % MONEY_SCALE).padStart(2, '0');
  return Number(`${sign}${whole}.${frac}`);
}

export function toMilli(quantity: number): number {
  return toMinor(quantity) * (QTY_SCALE / MONEY_SCALE);
}

export function fromMilli(milli: number): number {
  const sign = milli < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(milli));
  const whole = Math.trunc(abs / QTY_SCALE);
  const frac = String(abs % QTY_SCALE)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return Number(frac ? `${sign}${whole}.${frac}` : `${sign}${whole}`);
}

export function taxMinor(baseMinor: number, taxRate = 0): number {
  const rate = toMilli(taxRate);
  return Math.round((baseMinor * rate) / (QTY_SCALE * 100));
}

export function lineGrossMinor(quantity: number, unitRate: number): number {
  return Math.round((toMilli(quantity) * toMinor(unitRate)) / QTY_SCALE);
}

export interface LineInput {
  quantity: number;
  unitRate: number;
  discount?: number;
  taxRate?: number;
}

export interface ComputedLine {
  quantity: number;
  unitRate: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  grossMinor: number;
  discountMinor: number;
  taxMinor: number;
}

export function computeLine(input: LineInput): ComputedLine {
  const grossMinor = lineGrossMinor(input.quantity, input.unitRate);
  const discountMinor = Math.min(toMinor(input.discount ?? 0), grossMinor);
  const taxable = grossMinor - discountMinor;
  const tax = taxMinor(taxable, input.taxRate ?? 0);
  return {
    quantity: fromMilli(toMilli(input.quantity)),
    unitRate: fromMinor(toMinor(input.unitRate)),
    discount: fromMinor(discountMinor),
    taxRate: input.taxRate ?? 0,
    taxAmount: fromMinor(tax),
    lineTotal: fromMinor(taxable + tax),
    grossMinor,
    discountMinor,
    taxMinor: tax,
  };
}

export interface ChargeInput {
  amount: number;
  taxRate?: number;
}

export interface ComputedCharge {
  amount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  amountMinor: number;
  taxMinor: number;
}

export function computeCharge(input: ChargeInput): ComputedCharge {
  const amountMinor = toMinor(input.amount);
  const tax = taxMinor(amountMinor, input.taxRate ?? 0);
  return {
    amount: fromMinor(amountMinor),
    taxRate: input.taxRate ?? 0,
    taxAmount: fromMinor(tax),
    totalAmount: fromMinor(amountMinor + tax),
    amountMinor,
    taxMinor: tax,
  };
}

export interface PurchaseOrderTotals {
  subtotal: number;
  discount: number;
  taxAmount: number;
  additionalChargesTotal: number;
  grandTotal: number;
  items: ComputedLine[];
  charges: ComputedCharge[];
}

export function calculatePurchaseOrderTotals(
  items: LineInput[],
  charges: ChargeInput[],
  headerDiscount = 0,
): PurchaseOrderTotals {
  const computedItems = items.map((item) => computeLine(item));
  const computedCharges = charges.map((charge) => computeCharge(charge));
  const subtotalMinor = computedItems.reduce(
    (sum, item) => sum + item.grossMinor,
    0,
  );
  const lineDiscountMinor = computedItems.reduce(
    (sum, item) => sum + item.discountMinor,
    0,
  );
  const headerMinor = Math.min(
    toMinor(headerDiscount),
    Math.max(subtotalMinor - lineDiscountMinor, 0),
  );
  const discountMinor = lineDiscountMinor + headerMinor;
  const taxMinorTotal =
    computedItems.reduce((sum, item) => sum + item.taxMinor, 0) +
    computedCharges.reduce((sum, charge) => sum + charge.taxMinor, 0);
  const chargesMinor = computedCharges.reduce(
    (sum, charge) => sum + charge.amountMinor,
    0,
  );
  const grandMinor =
    subtotalMinor - discountMinor + taxMinorTotal + chargesMinor;
  return {
    subtotal: fromMinor(subtotalMinor),
    discount: fromMinor(discountMinor),
    taxAmount: fromMinor(taxMinorTotal),
    additionalChargesTotal: fromMinor(chargesMinor),
    grandTotal: fromMinor(grandMinor),
    items: computedItems,
    charges: computedCharges,
  };
}

export function pendingMilli(ordered: number, received: number): number {
  return toMilli(ordered) - toMilli(received);
}

export function maxReceivableMilli(
  ordered: number,
  tolerancePercent?: number,
): number {
  const orderedMilli = toMilli(ordered);
  if (!tolerancePercent || tolerancePercent <= 0) return orderedMilli;
  const extra = Math.round(
    (orderedMilli * toMilli(tolerancePercent)) / (QTY_SCALE * 100),
  );
  return orderedMilli + extra;
}

export function exceedsReceipt(
  ordered: number,
  alreadyReceived: number,
  incoming: number,
  tolerancePercent?: number,
): boolean {
  return (
    toMilli(alreadyReceived) + toMilli(incoming) >
    maxReceivableMilli(ordered, tolerancePercent)
  );
}

export function quantitiesBalance(
  received: number,
  accepted: number,
  rejected: number,
): boolean {
  return toMilli(received) === toMilli(accepted) + toMilli(rejected);
}

import {
  fromMilli,
  fromMinor,
  lineGrossMinor,
  toMilli,
  toMinor,
  computeLine,
} from '../../purchase-orders/utils/po-math';
import {
  EngineInput,
  EngineLineInput,
  MatchIssue,
  MatchLineResult,
  ThreeWayMatchResult,
  ToleranceApplied,
} from '../interfaces/invoice-match-result.interface';

export function amountWithinTolerance(
  expected: number,
  actual: number,
  tolerance: ToleranceApplied,
): boolean {
  const variance = Math.abs(toMinor(actual) - toMinor(expected));
  if (variance === 0) return true;
  const percent = tolerance.percent ?? 0;
  const amount = tolerance.amount ?? 0;
  if (percent <= 0 && amount <= 0) return false;
  let allowed = 0;
  if (percent > 0) {
    allowed = Math.max(
      allowed,
      Math.round(
        (Math.abs(toMinor(expected)) * toMilli(percent)) / (1000 * 100),
      ),
    );
  }
  if (amount > 0) {
    allowed = Math.max(allowed, toMinor(amount));
  }
  return variance <= allowed;
}

export function expectedLineAmount(input: {
  invoiceQuantity: number;
  poQuantity: number;
  unitRate: number;
  discount: number;
  taxRate: number;
}): number {
  if (toMilli(input.poQuantity) <= 0 || toMilli(input.invoiceQuantity) <= 0) {
    return 0;
  }
  const discountMinor = Math.min(
    Math.round(
      (toMinor(input.discount) * toMilli(input.invoiceQuantity)) /
        toMilli(input.poQuantity),
    ),
    lineGrossMinor(input.invoiceQuantity, input.unitRate),
  );
  return computeLine({
    quantity: input.invoiceQuantity,
    unitRate: input.unitRate,
    discount: fromMinor(discountMinor),
    taxRate: input.taxRate,
  }).lineTotal;
}

export function evaluateThreeWayMatch(input: EngineInput): ThreeWayMatchResult {
  const groups = new Map<string, EngineLineInput[]>();
  for (const line of input.lines) {
    const rows = groups.get(line.purchaseOrderItemId) ?? [];
    rows.push(line);
    groups.set(line.purchaseOrderItemId, rows);
  }

  const lines: MatchLineResult[] = [];
  const issues: MatchIssue[] = [];
  let expectedMinor = 0;
  let receivedAmountMinor = 0;

  for (const [purchaseOrderItemId, rows] of groups) {
    const sample = rows[0];
    const poQuantity = sample.poQuantity;
    const receivedQuantity = sample.receivedQuantity;
    const previouslyInvoicedQuantity = sample.previouslyInvoicedQuantity;
    const invoiceQuantity = fromMilli(
      rows.reduce((sum, row) => sum + toMilli(row.invoiceQuantity), 0),
    );
    const remainingMilli =
      toMilli(poQuantity) - toMilli(previouslyInvoicedQuantity);
    const remainingInvoiceableQuantity = fromMilli(Math.max(remainingMilli, 0));
    const quantityIssues: MatchIssue[] = [];
    if (toMilli(invoiceQuantity) > toMilli(receivedQuantity)) {
      quantityIssues.push({
        type: 'QUANTITY_MISMATCH',
        message: 'Invoice quantity exceeds received quantity',
        purchaseOrderItemId,
        invoiceItemId: sample.invoiceItemId,
      });
    }
    if (toMilli(invoiceQuantity) > remainingMilli) {
      quantityIssues.push({
        type: 'QUANTITY_MISMATCH',
        message: 'Invoice quantity exceeds remaining invoiceable quantity',
        purchaseOrderItemId,
        invoiceItemId: sample.invoiceItemId,
      });
    }
    issues.push(...quantityIssues);
    const quantityStatus = quantityIssues.length ? 'MISMATCH' : 'MATCH';
    receivedAmountMinor += toMinor(
      expectedLineAmount({
        invoiceQuantity: receivedQuantity,
        poQuantity,
        unitRate: sample.poUnitPrice,
        discount: sample.poDiscount,
        taxRate: sample.poTaxRate,
      }),
    );

    for (const row of rows) {
      const poAmount = expectedLineAmount({
        invoiceQuantity: row.invoiceQuantity,
        poQuantity,
        unitRate: row.poUnitPrice,
        discount: row.poDiscount,
        taxRate: row.poTaxRate,
      });
      expectedMinor += toMinor(poAmount);
      const lineIssues: MatchIssue[] = quantityIssues.map((issue) => ({
        ...issue,
        invoiceItemId: row.invoiceItemId,
      }));
      const amountOk =
        amountWithinTolerance(poAmount, row.invoiceAmount, input.tolerance) &&
        amountWithinTolerance(
          row.poUnitPrice,
          row.invoiceUnitPrice,
          input.tolerance,
        );
      if (!amountOk) {
        const amountIssue: MatchIssue = {
          type: 'AMOUNT_MISMATCH',
          message: 'Invoice amount is outside the configured tolerance',
          invoiceItemId: row.invoiceItemId,
          purchaseOrderItemId,
        };
        lineIssues.push(amountIssue);
        issues.push(amountIssue);
      }
      const amountStatus = amountOk ? 'MATCH' : 'MISMATCH';
      lines.push({
        invoiceItemId: row.invoiceItemId,
        purchaseOrderItemId,
        poQuantity,
        receivedQuantity,
        previouslyInvoicedQuantity,
        remainingInvoiceableQuantity,
        invoiceQuantity: row.invoiceQuantity,
        poUnitPrice: row.poUnitPrice,
        invoiceUnitPrice: row.invoiceUnitPrice,
        poAmount,
        invoiceAmount: row.invoiceAmount,
        quantityStatus,
        amountStatus,
        status:
          quantityStatus === 'MATCH' && amountStatus === 'MATCH'
            ? 'MATCH'
            : 'MISMATCH',
        issues: lineIssues,
      });
    }
  }

  expectedMinor += toMinor(input.additionalCharges);
  const headerOk = amountWithinTolerance(
    fromMinor(expectedMinor),
    input.invoiceTotalAmount,
    input.tolerance,
  );
  if (!headerOk) {
    issues.push({
      type: 'AMOUNT_MISMATCH',
      message: 'Invoice total is outside the configured tolerance',
    });
  }

  const quantityMatched = lines.every(
    (line) => line.quantityStatus === 'MATCH',
  );
  const amountMatched =
    headerOk && lines.every((line) => line.amountStatus === 'MATCH');
  const status = quantityMatched && amountMatched ? 'MATCH' : 'MISMATCH';

  const summary = lines.reduce(
    (total, line, index, all) => {
      const seen = all.findIndex(
        (row) => row.purchaseOrderItemId === line.purchaseOrderItemId,
      );
      const first = seen === index;
      return {
        poQuantity: fromMilli(
          toMilli(total.poQuantity) + (first ? toMilli(line.poQuantity) : 0),
        ),
        receivedQuantity: fromMilli(
          toMilli(total.receivedQuantity) +
            (first ? toMilli(line.receivedQuantity) : 0),
        ),
        invoiceQuantity: fromMilli(
          toMilli(total.invoiceQuantity) + toMilli(line.invoiceQuantity),
        ),
        previouslyInvoicedQuantity: fromMilli(
          toMilli(total.previouslyInvoicedQuantity) +
            (first ? toMilli(line.previouslyInvoicedQuantity) : 0),
        ),
        remainingInvoiceableQuantity: fromMilli(
          toMilli(total.remainingInvoiceableQuantity) +
            (first ? toMilli(line.remainingInvoiceableQuantity) : 0),
        ),
      };
    },
    {
      poQuantity: 0,
      receivedQuantity: 0,
      invoiceQuantity: 0,
      previouslyInvoicedQuantity: 0,
      remainingInvoiceableQuantity: 0,
    },
  );

  return {
    status,
    quantityMatched,
    amountMatched,
    lines,
    summary,
    issues,
    toleranceApplied: input.tolerance,
    poTotalAmount: input.poTotalAmount,
    invoiceTotalAmount: input.invoiceTotalAmount,
    receivedTotalAmount: fromMinor(receivedAmountMinor),
    quantityVariance: fromMilli(
      toMilli(summary.invoiceQuantity) - toMilli(summary.receivedQuantity),
    ),
    amountVariance: fromMinor(
      toMinor(input.invoiceTotalAmount) - expectedMinor,
    ),
  };
}

export interface MatchIssue {
  type: 'QUANTITY_MISMATCH' | 'AMOUNT_MISMATCH';
  message: string;
  invoiceItemId?: string;
  purchaseOrderItemId?: string;
}

export interface MatchLineResult {
  invoiceItemId: string;
  purchaseOrderItemId: string;
  poQuantity: number;
  receivedQuantity: number;
  previouslyInvoicedQuantity: number;
  remainingInvoiceableQuantity: number;
  invoiceQuantity: number;
  poUnitPrice: number;
  invoiceUnitPrice: number;
  poAmount: number;
  invoiceAmount: number;
  quantityStatus: 'MATCH' | 'MISMATCH';
  amountStatus: 'MATCH' | 'MISMATCH';
  status: 'MATCH' | 'MISMATCH';
  issues: MatchIssue[];
}

export interface MatchSummary {
  poQuantity: number;
  receivedQuantity: number;
  invoiceQuantity: number;
  previouslyInvoicedQuantity: number;
  remainingInvoiceableQuantity: number;
}

export interface ToleranceApplied {
  percent: number;
  amount: number;
}

export interface ThreeWayMatchResult {
  status: 'MATCH' | 'MISMATCH';
  quantityMatched: boolean;
  amountMatched: boolean;
  lines: MatchLineResult[];
  summary: MatchSummary;
  issues: MatchIssue[];
  toleranceApplied: ToleranceApplied;
  poTotalAmount: number;
  invoiceTotalAmount: number;
  receivedTotalAmount: number;
  quantityVariance: number;
  amountVariance: number;
}

export interface EngineLineInput {
  invoiceItemId: string;
  purchaseOrderItemId: string;
  poQuantity: number;
  receivedQuantity: number;
  previouslyInvoicedQuantity: number;
  invoiceQuantity: number;
  poUnitPrice: number;
  invoiceUnitPrice: number;
  poDiscount: number;
  poTaxRate: number;
  invoiceAmount: number;
}

export interface EngineInput {
  lines: EngineLineInput[];
  invoiceTotalAmount: number;
  poTotalAmount: number;
  additionalCharges: number;
  tolerance: ToleranceApplied;
}

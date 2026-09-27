# Invoice, accounts intake, and 3-way match

Phase 7 compares a purchase order, the approved GRNs it references, and the vendor invoice. A match means the invoice is valid for accounts approval. It does not create a payment, release funds, or post to Tally.

```
PO
 ↓
GRN
 ↓
Invoice
 ↓
Accounts
 ↓
3-Way Match
 ↓
MATCH / MISMATCH / HOLD
 ↓
Accounts Approval
```

## Document number

`invoiceNumber` is allocated by `NumberingService` from the tenant numbering configuration (`settings.numbering.invoice`, default `INV-2026-00001`). The vendor's own number is stored as `vendorInvoiceNumber` and is unique per tenant and vendor.

## Quantity

For each purchase-order line:

- invoice quantity must be less than or equal to the accepted quantity on the approved GRNs referenced by the invoice
- invoice quantity must be less than or equal to `PO quantity - previously matched or approved invoice quantity`

Partial receipt is valid. A GRN of 90 against a PO of 100 can match an invoice of 90. Rejected and cancelled invoices are not counted as consumed quantity. One PO can have many GRNs and many invoices. An invoice can reference several GRNs, and the received quantity is the sum of those GRNs.

## Amount

Each invoice line is compared with the purchase-order rate, discount, and tax for the invoiced quantity. The invoice total is compared with that expected amount. The allowed difference comes from the tenant settings:

- `invoiceTolerancePercent`
- `invoiceToleranceAmount`

Nothing in the match engine hard-codes 2%. When both values are set, the larger of the two allowances is used. Outside that allowance the result is `MISMATCH`.

## Status

Invoice status and match status are separate. A mismatch is never stored or approved as a match. `MATCHED` can move to `APPROVED` only through the tenant's `INVOICE_APPROVAL` workflow. The seeded approver is the `ACCOUNTS` role; change the workflow definition to use a different role or user. Payment release is a later phase.

Accounts review SLA uses the working calendar (`INVOICE_ACCOUNTS_REVIEW`), not a fixed number of hours added to `createdAt`.

## APIs

| Method | Path | Permission |
| --- | --- | --- |
| POST | `/api/v1/invoices` | `invoices.create` |
| GET | `/api/v1/invoices` | `invoices.read` |
| GET | `/api/v1/invoices/:id` | `invoices.read` |
| PATCH | `/api/v1/invoices/:id` | `invoices.update` |
| POST | `/api/v1/invoices/:id/submit` | `invoices.submit` |
| POST | `/api/v1/invoices/:id/cancel` | `invoices.cancel` |
| GET | `/api/v1/invoices/accounts/pending` | `invoices.review` |
| GET | `/api/v1/invoices/accounts/review` | `invoices.review` |
| GET | `/api/v1/invoices/accounts/mismatch` | `invoices.review` |
| GET | `/api/v1/invoices/accounts/on-hold` | `invoices.review` |
| GET | `/api/v1/invoices/:id/accounts-view` | `invoices.review` |
| POST | `/api/v1/invoices/:id/review` | `invoices.review` |
| POST | `/api/v1/invoices/:id/three-way-match` | `invoices.match` |
| POST | `/api/v1/invoices/:id/hold` | `invoices.hold` |
| POST | `/api/v1/invoices/:id/release-hold` | `invoices.hold` |
| POST | `/api/v1/invoices/:id/approve` | `invoices.approve` |
| POST | `/api/v1/invoices/:id/reject` | `invoices.reject` |

List queries use `page` and `limit` (or `pageSize`). Every query is filtered by the authenticated tenant. Cross-tenant ids return 404.

Attachment bytes are not stored in MongoDB. The API accepts metadata (`fileName`, `mimeType`, `size`, `storageKey`) for PDF, PNG, JPG, and JPEG files up to 10 MB.

## Example match response

```json
{
  "status": "MATCH",
  "quantityMatched": true,
  "amountMatched": true,
  "summary": {
    "poQuantity": 100,
    "receivedQuantity": 90,
    "invoiceQuantity": 90,
    "previouslyInvoicedQuantity": 0,
    "remainingInvoiceableQuantity": 100
  },
  "issues": []
}
```

An invoice of 100 against a GRN of 90 returns `MISMATCH` and is not approved.

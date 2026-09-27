# Purchase orders

A purchase order is created only from a purchase approval whose status is `APPROVED`. The approval, vendor selection, comparison statement, procurement request, project, site, and vendor must all belong to the authenticated tenant. Project, site, and vendor are copied from that approval. A client-supplied tenant, project, or vendor is not trusted.

Phase 5 HTTP APIs are not in this codebase yet. Phase 6 reads the Phase 5 collections (`purchase_approvals`, `vendor_selections`, `vendor_selection_items`, `procurement_requests`, `comparison_statements`, `vendors`) and copies quantities and rates from the approved vendor selection. Line totals are calculated on the server.

## Status

```
DRAFT → PENDING_APPROVAL → APPROVED → SENT_TO_VENDOR → ACKNOWLEDGED
  → PARTIALLY_DELIVERED → FULLY_DELIVERED → CLOSED
DRAFT → CANCELLED
APPROVED (and later open states, except fully delivered) → CANCELLED
```

`PARTIALLY_DELIVERED` and `FULLY_DELIVERED` are set only when a GRN is approved. `CLOSED` is reserved and has no close API.

Sending back an approval returns the PO to `DRAFT` with approval status `SEND_BACK`. Rejection sets approval status `REJECTED` and does not set the PO status to `APPROVED`. A rejected PO cannot be delivered.

Financial edits (items, charges, header discount) are allowed only in `DRAFT`. After approval they return `PO_AMENDMENT_REQUIRED`. There is no amendment module.

Cancellation requires a reason. A fully delivered or closed PO cannot be cancelled. A partially delivered PO can be cancelled only when the tenant setting `allowPartialPoCancel` is true.

Creating a PO for a purchase approval that already has a PO returns the existing order.

## Totals

Amounts are calculated in integer paise and stored as rupee values with two decimal places.

```
subtotal = sum(quantity × unit rate)
discount = header discount + line discounts
taxAmount = item tax + charge tax
additionalChargesTotal = sum of pre-tax charge amounts
grandTotal = subtotal − discount + taxAmount + additionalChargesTotal
```

`pendingQuantity = ordered quantity − receivedQuantity`. Received quantity changes only on GRN approval.

## Tenant isolation

Every query includes the tenant from the JWT. Another tenant's PO, item, or charge id returns 404.

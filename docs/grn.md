# Goods receipt notes

One purchase order has many GRNs. The PO does not store a single `grnId`. Each GRN points at the PO and at a delivery that belongs to that PO and is `DELIVERED` (or `PARTIALLY_RECEIVED`). Site and vendor are taken from the PO.

## Status

```
DRAFT → SUBMITTED → APPROVED
SUBMITTED → REJECTED
DRAFT → CANCELLED
```

`REJECTED` cannot move to `APPROVED`. There is no close API. Submit starts the `GRN_APPROVAL` workflow (seeded to the project head). `POST /grns/:id/approve` and `POST /grns/:id/reject` delegate to `WorkflowEngineService.act` for the current user. Reject requires a reason. A second approve fails with `ALREADY_PROCESSED`.

SLA hours for `GRN_APPROVAL` come from `SLAConfiguration`, seeded from tenant settings.

## Quantities

`previouslyReceivedQuantity` is the sum of `acceptedQuantity` on historical **approved** GRNs, loaded in one aggregation by `GRNQuantityService.getReceivedQuantities`. The client value is ignored.

`acceptedQuantity + rejectedQuantity` must equal `receivedQuantity`. Only `acceptedQuantity` is added to the PO item when the GRN is approved. A rejected GRN does not change PO received quantity.

Pending after this receipt is `ordered − previously accepted − current received`, and it cannot go negative. Default over-receipt is denied (`PO_QUANTITY_EXCEEDED`). If the tenant sets `overReceiptTolerancePercent`, that tolerance is the maximum. Nothing is hard-coded.

Approval runs in a MongoDB transaction (with the standalone fallback used elsewhere, and a retry on write conflicts):

1. Re-read the GRN. A second approval fails.
2. Recompute historical accepted quantities.
3. Conditionally update each PO item so `received + accepted` cannot pass the ordered quantity (plus tolerance). Two concurrent GRNs of 70 and 50 on a PO of 100 cannot become 120. One fails with `PO_QUANTITY_EXCEEDED`. Pending quantity is never negative.
4. If received is below ordered, the PO becomes `PARTIALLY_DELIVERED`. If received covers the order, it becomes `FULLY_DELIVERED`.
5. Mark the GRN `APPROVED`, then audit and notify.

`GET /grn/summary` returns `pendingGRN` (draft + submitted), `approvedGRN`, `rejectedGRN`, `partialReceipts` (POs partially delivered), and `completedReceipts` (POs fully delivered).

Cross-tenant GRN and GRN item ids return 404.

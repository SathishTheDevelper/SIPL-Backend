# Deliveries

A delivery is a shipment against one purchase order. The vendor, project, and site are copied from the PO. The PO must be approved or further along (`SENT_TO_VENDOR`, `ACKNOWLEDGED`, `PARTIALLY_DELIVERED`). Rejected, cancelled, closed, and draft POs cannot be shipped.

## Status

```
SCHEDULED → IN_TRANSIT → DELIVERED
SCHEDULED → CANCELLED
```

A cancelled delivery cannot become delivered.

## Quantity rule (delivery versus GRN)

Delivery quantity is logistical. It is validated against ordered quantity minus quantities already on non-cancelled deliveries, so a PO cannot be shipped twice for the same units. It does **not** increase `receivedQuantity` or reduce the quantity a GRN may accept.

PO received quantity, pending quantity, and the PO statuses `PARTIALLY_DELIVERED` / `FULLY_DELIVERED` change only when a GRN is approved, using **accepted** quantity.

Example: PO quantity 100.

1. Deliver 40 and mark the delivery `DELIVERED`. PO received stays 0 and pending stays 100. A GRN for those 40 units is still allowed.
2. Approve a GRN that accepts 40. PO received becomes 40, pending 60, status `PARTIALLY_DELIVERED`.

This follows the receipt rule (GRN approval owns stock) and avoids counting the same 40 units against both the shipment pool and the receipt pool. Over-receipt is denied unless the tenant setting `overReceiptTolerancePercent` is set. No percentage is hard-coded.

The delivery number comes from `NumberingService` document type `DELIVERY`. Attachment metadata stores `storageKey` only. File bytes are not written to MongoDB.

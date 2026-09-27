# Purchase order charges

Charges are separate documents, not a text field on the purchase order. Each charge stores `tenantId`, `purchaseOrderId`, `projectId`, `vendorId`, `chargeType`, `description`, `amount`, `taxRate`, `taxAmount`, and `totalAmount`.

Charge types: `DELIVERY`, `INSTALLATION`, `TRANSPORTATION`, `LOADING`, `UNLOADING`, `OTHER`.

`amount` is the pre-tax value supplied by the client. `taxAmount` and `totalAmount` are calculated on the server. The purchase order `additionalChargesTotal` is the sum of charge amounts (pre-tax). Charge tax is included in the PO `taxAmount`, so it is not added twice.

Example: material subtotal 100000 with delivery 5000, installation 10000, and transportation 7000 produces `additionalChargesTotal` 22000 and, with no discount or tax, `grandTotal` 122000.

Charges can be created with the purchase order or added, updated, and deleted while the PO is `DRAFT`. After approval, charge changes return `PO_AMENDMENT_REQUIRED`.

Indexes: `tenantId + purchaseOrderId`, `tenantId + projectId`.

# Purchase order approval

Submit (`POST /purchase-orders/:id/submit`) moves a draft PO to `PENDING_APPROVAL` / approval status `PENDING` and starts `WorkflowEngineService` for module `PO_APPROVAL`. A second submit while that workflow is open returns the same PO.

Approve, reject, and send-back are not separate PO endpoints. They use the existing workflow task endpoint `POST /workflows/instances/:id/actions`. Reject and send-back require a reason. The workflow writes `ApprovalHistory`. The PO outcome handler writes a `PurchaseOrderApprovalReference`, an audit event, and a notification.

Workflow context includes `projectId`, `projectHeadUserId`, `amount` (server grand total), `currency`, and `vendorId`. The seeded workflow assigns the project head. Amount limits stay on the tenant (`poApprovalLimits`) and are not hard-coded as Manager, L1, L2, or CFO steps. SLA hours come from `SLAConfiguration` for `PO_APPROVAL` (seeded from tenant settings). The workflow step does not embed an hour value.

Outcomes:

| Workflow result | PO status | Approval status |
| --- | --- | --- |
| APPROVED | APPROVED | APPROVED |
| REJECTED | stays pending, never APPROVED | REJECTED |
| SEND_BACK | DRAFT | SEND_BACK |

Only an approved PO can be sent to the vendor and then acknowledged. There is no vendor portal. Acknowledgement records `acknowledgedAt`, remarks, and an optional expected delivery date.

Duplicate approval fails because the workflow instance is no longer open (`ALREADY_PROCESSED`).

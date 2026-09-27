# Site material request

`POST /api/v1/projects/:projectId/material-requests` creates a draft against the project's active approved BOQ and an active site on that project. The request number comes from `NumberingService` (`MR`).

Items store the BOQ item and the requested quantity. On submit the server:

1. Confirms tenant, project, site, approved BOQ, and BOQ item.
2. Sums previously approved quantities for those BOQ items with one aggregation (`status = APPROVED`), ignoring values sent by the client.
3. Calculates the 30% rule and stores `cumulativeQuantity` and `increasePercentage`.
4. Sets `exceptionStatus` to `NORMAL` or `EXCEPTION`.
5. Starts the configured `MATERIAL_APPROVAL` workflow and its SLA.
6. Writes audit logs and notifications.

Approve, reject, and send-back stay on `POST /api/v1/workflows/instances/:id/actions`. Reject and send-back require a reason. A rejection sets the request to `REJECTED`, stores `rejectionReason`, and notifies the requester and site roles. Send-back sets `SEND_BACK` and keeps history.

Approving a request refreshes material-planning status from the aggregated approved quantity (`PLANNED`, `PARTIALLY_REQUESTED`, `FULLY_REQUESTED`).

Procurement is not started here.

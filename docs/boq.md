# Project BOQ

A project can have many BOQ versions. Each version is its own document (`DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `SUPERSEDED`, `CANCELLED`). Approving a new version marks the previous `APPROVED` version `SUPERSEDED`. Historical versions are not overwritten. `POST /boq/:id/revise` copies items into the next draft.

Item `amount` is `quantity × rate`, calculated on the server. Material, category, and unit must belong to the same tenant. The project must belong to the tenant and must not be completed, closed, or cancelled.

## Approval

Submit starts the tenant's active `BOQ_APPROVAL` workflow. The seeded step is Project Head, with SLA hours taken from `SLAConfiguration` / the workflow step (`BOQ_APPROVAL`), not a hard-coded duration. `POST /boq/:id/approve` and `reject` call `WorkflowEngineService.act`. The outcome handler writes status, approval history (via the workflow engine), audit, and notification.

Only the latest `APPROVED` version is used for material-request checks.

Numbers are allocated by `NumberingService` with document type `BOQ`.

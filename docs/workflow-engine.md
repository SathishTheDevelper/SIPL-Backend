# Workflow engine

The backend owns approver resolution. The frontend never chooses who approves.

## Collections

- `workflow_definitions` — tenant + module + version, with embedded `WorkflowStep`s
- `workflow_instances` — one open instance per business record
- `workflow_actions` — each APPROVE / REJECT / SEND_BACK / ESCALATE
- `approval_histories` — complete readable history

## Approver types

| Type | How the backend resolves it |
| --- | --- |
| `USER` | Step `approverUser` |
| `ROLE` | Any active user with `approverRole` |
| `MANAGER` | `context.managerUserId` or the initiator's `managerUserId` |
| `PROJECT_HEAD` | `context.projectHeadUserId`, else users with role `PROJECT_HEAD` |
| `CONFIGURED_USER` | Step user, else tenant `settings.approvalHierarchy` |

Approver users are never hard-coded in services.

## Actions

- `APPROVE` — advance or complete
- `REJECT` — reason **required**, instance closed
- `SEND_BACK` — reason **required**, instance closed for correction
- `ESCALATE` — reassign using the module's SLA `escalateToRole` / `escalateToUser`

Double approval is blocked with optimistic `version` on the instance.

## APIs

- `POST /api/v1/workflows/definitions`
- `GET /api/v1/workflows/definitions`
- `PATCH /api/v1/workflows/definitions/:id/activate`
- `POST /api/v1/workflows/instances`
- `GET /api/v1/workflows/inbox`
- `GET /api/v1/workflows/instances/:id`
- `POST /api/v1/workflows/instances/:id/actions`

Cross-tenant instance ids return 404.

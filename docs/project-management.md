# Project Management

WIN client decision → Project (PLANNING) → activate → Site.

## Creation rule

An **active commercial project is created only from a WIN `ClientDecision`**.

- `POST /api/v1/projects` requires `clientDecisionId` whose `decision` is `WIN`
- A LOSE decision returns `409 PROJECT_NOT_ALLOWED`
- Opportunity `/lose` and Tender `/lose` never create a project
- Manual requests without a validated WIN source are rejected
- Duplicate WIN / duplicate `quotationId` returns `409 DUPLICATE_WIN` (unique indexes on `tenantId + quotationId` and `tenantId + clientDecisionId`)

WIN + project writes run in a MongoDB transaction (replica-set). If transactions are unsupported, unique indexes still prevent a partial second project.

The created project stores `tenderId`, `opportunityId`, `quotationId`, `clientDecisionId`, and the tenant id. The project number is allocated by `NumberingService` (`PROJECT`).

BOQ is not created in Phase 3.

## Statuses

```
PLANNING → ACTIVE → ON_HOLD | COMPLETED | CANCELLED
ON_HOLD → ACTIVE | CANCELLED
COMPLETED → CLOSED
PLANNING → CANCELLED
```

Planning fields: `plannedStartDate`, `plannedEndDate`, `projectHead`, `projectManager`, `remarks`. Scheduling engines are out of scope.

## Members

`ProjectMember` is a separate collection. Roles (`PROJECT_HEAD`, `PROJECT_MANAGER`, `SITE_MANAGER`, `SITE_ENGINEER`, `OFFICE_USER`) are labels; authorization still uses RBAC permissions.

## APIs

- `POST/GET /api/v1/projects`, `GET/PATCH /api/v1/projects/:id`
- `GET /api/v1/projects/summary`
- `POST /api/v1/projects/:id/activate|on-hold|complete|cancel`
- `GET/POST /api/v1/projects/:id/members`
- `PATCH/DELETE /api/v1/projects/:id/members/:memberId`

## Integrations

Audit and queued notifications fire on create and status changes. Custom fields use module `PROJECT`.

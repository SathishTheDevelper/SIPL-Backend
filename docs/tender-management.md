# Tender Management

Opportunity → Tender / Enquiry → Requirement Capture.

## Entities

| Entity | Collection | Number |
| --- | --- | --- |
| Tender | `tenders` | `TENDER` |
| TenderRequirementReference | `tender_requirement_references` | — |
| Requirement | `requirements` (embedded items) | — |

Project types on a requirement: `CIVIL` | `INTERIOR`. There is one application for both.

## Tender statuses

```
DRAFT → RECEIVED → IN_PROGRESS → SUBMITTED → UNDER_EVALUATION → WON | LOST
DRAFT / RECEIVED / IN_PROGRESS / SUBMITTED → CANCELLED
```

`POST /tenders/:id/submit` moves the tender to `SUBMITTED` from draft, received, or in-progress.

Rules:

- `submissionDate` cannot be before `issueDate`
- A cancelled tender cannot be submitted
- A lost or cancelled tender cannot create an active Project
- Tender `/win` and `/lose` update status only; they do **not** create a Project

## Requirement capture

`POST /api/v1/tenders/:tenderId/requirements` stores description, location, dates, and line items (`quantity × estimatedRate` computed on the backend). Material Master is Phase 4 and is not used.

## Workflow and SLA

Tender submit calls `WorkflowService.startIfConfigured({ module: TENDER_APPROVAL })`. Approvers and SLA hours come from the tenant workflow definition and `SLAConfiguration`. They are not hard-coded.

## APIs

- `POST/GET /api/v1/tenders`, `GET/PATCH /api/v1/tenders/:id`
- `POST /api/v1/tenders/:id/submit|win|lose|cancel`
- `POST/GET /api/v1/tenders/:tenderId/requirements`
- `GET/PATCH /api/v1/requirements/:id`
- `POST /api/v1/requirements/:id/submit`

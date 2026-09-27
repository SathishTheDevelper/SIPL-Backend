# Quotation Management

Requirement Capture → Quotation → Client Decision (WIN / LOSE).

## Entities

| Entity | Collection | Number |
| --- | --- | --- |
| Quotation | `quotations` | `QUOTATION` |
| ClientDecision | `client_decisions` | — |

## Totals

The backend calculates `subtotal`, `discount`, `tax`, and `total`. Client-supplied totals are ignored.

## Versioning

- First quotation is version `1`, `isCurrent: true`
- `POST /quotations/:id/revise` marks the current version `REVISED` / `isCurrent: false` and creates version `n+1` with `previousQuotationId`
- Historical submitted versions are never overwritten
- Only one current version exists per revision chain

## Statuses

```
DRAFT → SUBMITTED → ACCEPTED | REJECTED | EXPIRED | CANCELLED
DRAFT → CANCELLED
SUBMITTED → REVISED (previous version after revise)
```

A client decision is allowed only on a current quotation that is `SUBMITTED` (or already `ACCEPTED` for idempotent WIN) and not expired.

## WIN / LOSE

| Decision | Required | Effect |
| --- | --- | --- |
| WIN | Quotation eligible, tender not lost/cancelled | ClientDecision + Project in one MongoDB transaction |
| LOSE | `reason` | Quotation `REJECTED`, tender `LOST`, opportunity `LOST`. **No Project** |

Duplicate WIN on the same quotation returns the existing decision and project (`tenantId + quotationId` unique).

## APIs

- `POST/GET /api/v1/tenders/:tenderId/quotations`
- `GET/PATCH /api/v1/quotations/:id`
- `POST /api/v1/quotations/:id/submit|revise|cancel`
- `POST /api/v1/quotations/:quotationId/client-decision`
- `GET /api/v1/client-decisions/:id`

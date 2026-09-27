# Business Development

Lead → Opportunity is the start of the SIPL commercial pipeline. All documents are tenant-scoped (`tenantId` on every query). Cross-tenant ids return **404**.

## Entities

| Entity | Collection | Number | Notes |
| --- | --- | --- | --- |
| Lead | `leads` | `LEAD` via NumberingService | Owner, assignee, custom fields |
| LeadActivity | `lead_activities` | — | Notes against a lead |
| Opportunity | `opportunities` | `OPPORTUNITY` | Stores `leadId` after conversion |
| OpportunityActivity | `opportunity_activities` | — | Notes against an opportunity |

## Lead statuses

```
NEW → CONTACTED → QUALIFIED → CONVERTED
 NEW / CONTACTED → DISQUALIFIED → CLOSED
 QUALIFIED → DISQUALIFIED
 * → CLOSED (delete)
```

Only a **QUALIFIED** lead can be converted. Conversion creates an Opportunity with `leadId` and does not copy unnecessary lead fields.

## Opportunity stages and statuses

Stages (forward only):

```
IDENTIFIED → QUALIFICATION → PROPOSAL → NEGOTIATION → DECISION
```

Statuses: `OPEN` | `WON` | `LOST` | `CLOSED`

Marking **LOST** requires `lostReason`. Opportunity `/win` and `/lose` do **not** create a Project. A project is created only from a **WIN** client decision on a submitted quotation.

## APIs

- `POST/GET /api/v1/leads`, `GET/PATCH/DELETE /api/v1/leads/:id`
- `POST /api/v1/leads/:id/qualify|disqualify|convert`
- `GET/POST /api/v1/leads/:id/activities`
- `POST/GET /api/v1/opportunities`, `GET/PATCH /api/v1/opportunities/:id`
- `POST /api/v1/opportunities/:id/move-stage|win|lose`
- `GET /api/v1/business-development/summary`

List endpoints support `page`, `limit` (max 100), `q`, `status`, `owner`, `dateFrom`, `dateTo`, `sortBy`, `sortOrder`. Sort fields are whitelisted.

## Integrations

- **Numbering** — `LEAD`, `OPPORTUNITY`
- **Custom fields** — `CustomFieldValidationService` for module `LEAD` / `OPPORTUNITY`
- **Audit** — create, qualify, disqualify, convert, stage change, win, lose
- **Notifications** — lead/opportunity assigned
- **RBAC** — `leads.*`, `opportunities.*`

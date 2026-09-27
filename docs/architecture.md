# Architecture

SIPL Workflow 360 is a single NestJS application. Site users and office users share one API, one database, and one transaction chain.

## Runtime

```
Client
  → NestJS (JWT, tenant guards, validation)
    → Services / domain
      → TenantAwareRepository
        → MongoDB (one database, shared collections)
    → Redis (refresh tokens, password reset, cache later)
    → BullMQ (mail now; SLA, notifications, outbox later)
```

## Modules (Phase 1)

| Module | Responsibility |
| --- | --- |
| `config` | Environment loading and validation |
| `database` | Mongoose connection |
| `redis` | ioredis wrapper + in-memory mode for tests |
| `auth` | Login, refresh, logout, password flows |
| `tenants` | Platform tenant management and settings |
| `users` | Tenant-scoped users |
| `roles` | Configurable tenant roles |
| `permissions` | Platform permission catalog |
| `mail` | Password reset delivery |
| `health` | Liveness / readiness |

Phase 2 adds custom fields, numbering, workflow, SLA, notifications, and immutable audit logs in the same process. Phase 3 adds business development (Lead → Opportunity → Tender → Requirement → Quotation → Client Decision), projects, and sites. A Project is created only from a WIN client decision. BOQ, materials, attendance, and procurement belong to later phases.

## Layering

- Controllers: HTTP + DTO validation only
- Services: business rules
- Repositories: MongoDB access
- `TenantAwareRepository`: injects `tenantId` from `TenantContext` (AsyncLocalStorage populated from JWT)

## Configuration

Tenant settings (geofence radius, SLA hours, PO limits, numbering, GST, working hours) live on the tenant document. Application code reads settings; it does not hard-code those values.

## Security

Helmet, CORS, throttling, JWT, bcrypt, class-validator whitelist, request size limits. Passwords, refresh tokens, and JWT secrets are redacted from Pino logs.

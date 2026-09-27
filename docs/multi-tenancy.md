# Multi-tenancy

## Model

- One MongoDB database
- Shared collections
- Every tenant-owned document includes `tenantId`
- Queries for tenant data always include `{ tenantId, ... }`

Not used: database-per-tenant, collection-per-tenant.

## Tenant context

JWT payload:

```json
{
  "sub": "<userId>",
  "tenantId": "<tenantId|null>",
  "role": "<role>"
}
```

`tenantId` is taken only from this token. Body, query, route, and local storage values are ignored for isolation.

Platform `SUPER_ADMIN` has `tenantId: null`. To work inside a tenant they call `POST /api/v1/auth/switch-tenant`, which mints a new JWT. After that, isolation still comes from the token.

## Enforcement

1. `JwtAuthGuard` authenticates
2. `TenantGuard` requires an active tenant on tenant-scoped routes
3. `TenantContextInterceptor` stores `{ tenantId, userId, role }` in AsyncLocalStorage
4. `TenantAwareRepository` adds `tenantId` to find/update/create

A Tenant A token querying a Tenant B `_id` matches zero documents and returns **404**, not 403.

## Indexes

Tenant-first indexes on tenant-owned collections, for example:

- `{ tenantId: 1, email: 1 }` unique on users
- `{ tenantId: 1, code: 1 }` unique on roles
- `{ tenantId: 1, status: 1 }`
- `{ tenantId: 1, createdAt: -1 }`

## Cache keys (later phases)

Always include tenantId: `dashboard:{tenantId}:summary`. Never `dashboard:summary`.

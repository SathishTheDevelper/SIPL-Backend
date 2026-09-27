# API guide

Base path: `/api/v1`  
Swagger UI: `/docs`  
Auth: `Authorization: Bearer <accessToken>`

## Response shape

Success:

```json
{ "success": true, "data": {}, "message": "Success" }
```

List:

```json
{
  "success": true,
  "data": [],
  "message": "Success",
  "pagination": { "page": 1, "limit": 20, "total": 100, "hasNext": true }
}
```

Error:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Readable message",
  "errorCode": "VALIDATION_ERROR",
  "timestamp": "...",
  "path": "/api/v1/users",
  "errors": []
}
```

Stack traces are not returned in production.

## Phase 1 resources

### Auth

- `POST /auth/login` `{ email, password, tenantCode? }`
- `POST /auth/refresh` `{ refreshToken }`
- `POST /auth/logout` `{ refreshToken? }`
- `POST /auth/change-password` `{ currentPassword, newPassword }`
- `POST /auth/forgot-password` `{ email, tenantCode? }`
- `POST /auth/reset-password` `{ token, newPassword }`
- `GET /auth/me`
- `POST /auth/switch-tenant` `{ tenantId }` (super admin)

### Tenants (super admin)

- `POST /tenants`
- `GET /tenants`
- `GET /tenants/:id`
- `PATCH /tenants/:id`
- `PATCH /tenants/:id/status`
- `PATCH /tenants/:id/settings`

Settings include geofence radius, working hours, SLA hours by module, PO approval limits, numbering, GST, currency, financial year, and notification recipients.

### Users / roles / permissions

- Users and roles are tenant scoped. Cross-tenant ids return 404.
- `tenantId` is rejected on create/update bodies (`forbidNonWhitelisted`).
- Permissions are a platform catalog.

## Phase 2 resources

### Custom fields

- `POST /custom-fields`
- `GET /custom-fields/:module`
- `PATCH /custom-fields/:id`
- `DELETE /custom-fields/:id` (deactivates)

### Workflow

- `POST /workflows/definitions`
- `GET /workflows/definitions`
- `PATCH /workflows/definitions/:id/activate`
- `POST /workflows/instances`
- `GET /workflows/inbox`
- `GET /workflows/instances/:id`
- `POST /workflows/instances/:id/actions` `{ action, reason? }`

### SLA

- `POST /sla/calendars`
- `GET /sla/calendars`
- `POST /sla/holidays`
- `POST /sla/configurations`
- `GET /sla/configurations`
- `GET /sla/instances`

### Notifications

- `GET /notifications`
- `PATCH /notifications/:id/read`
- `GET /notifications/preferences`
- `PATCH /notifications/preferences`

### Audit (read-only)

- `GET /audit-logs`
- `GET /audit-logs/:id`
- `PATCH` / `DELETE` are rejected (`AUDIT_IMMUTABLE`)

### Numbering

- `GET /numbering`
- `POST /numbering/next` `{ documentType }` — atomic, tenant scoped

## Pagination

`?page=1&limit=20&q=search`  
`limit` max 100. Invoice lists also accept `pageSize` as an alias of `limit`.

## Phase 7 invoices

See [Three-way match](three-way-match.md).

- `POST /invoices` uploads a site invoice against a PO and one or more approved GRNs
- `POST /invoices/:id/submit` then `POST /invoices/:id/review`
- `POST /invoices/:id/three-way-match` returns `MATCH` or `MISMATCH`
- `POST /invoices/:id/approve` runs the configured workflow and does not create a payment


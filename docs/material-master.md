# Material master

Materials, categories, and units of measure are tenant-owned master data. Codes are unique per tenant (`tenantId + materialCode`, `tenantId + code`). Status is `ACTIVE` or `INACTIVE`. Extra attributes go in `customFields` and are checked by `CustomFieldValidationService`. The API never adds tenant-specific MongoDB fields.

## APIs

- `POST/GET /api/v1/materials`, `GET/PATCH /api/v1/materials/:id`
- `POST /api/v1/materials/:id/activate` and `deactivate`
- `POST/GET/PATCH/DELETE /api/v1/material-categories` and `/:id`
- `POST/GET/PATCH/DELETE /api/v1/units` and `/:id`

A missing or cross-tenant id returns 404. A duplicate code returns 409. Categories and units that are referenced by a material cannot be deleted.

`tenantId` comes from the JWT. List endpoints are paginated and use tenant-first indexes.

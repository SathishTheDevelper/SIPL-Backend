# Site Management

Tenant → Project → many Sites. Sites are a separate collection. They are not embedded on the project document.

## Fields

Every site has `tenantId` and `projectId`, plus name, uppercase `code`, address, coordinates, and `geofenceRadius`.

`geofenceRadius` is configurable. If omitted, the tenant setting `settings.geofenceRadiusMeters` is used. Values are not hard-coded to 100 / 250 / 500.

## Validation

- Latitude ∈ [-90, 90]
- Longitude ∈ [-180, 180]
- `geofenceRadius > 0`
- Unique compound index: `tenantId + projectId + code`

## Statuses

```
DRAFT → ACTIVE → INACTIVE | CLOSED
INACTIVE → ACTIVE | CLOSED
```

## APIs

- `POST/GET /api/v1/projects/:projectId/sites`
- `GET/PATCH /api/v1/sites/:id`
- `POST /api/v1/sites/:id/activate|deactivate|close`

Cross-tenant access returns **404**. Custom fields use module `SITE`.

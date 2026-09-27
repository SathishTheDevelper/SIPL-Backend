# SLA engine

SLA due dates are calculated on tenant working days, working hours, timezone, and holidays. The engine never uses `createdAt + N` calendar hours.

Default window (overridable per tenant calendar): Monday–Friday, 09:00–18:00.

## Example

Friday 17:00 + 2 working hours = Monday 10:00.

Hours for a module come from, in order:

1. The workflow step `slaHours`
2. `sla_configurations.hours` for that module
3. `tenant.settings.slaHoursByModule`

None of those values are hard-coded in services.

## Collections

- `business_calendars`
- `holidays`
- `sla_configurations`
- `sla_instances`
- `escalation_events`

## Breach

BullMQ job `sla-check` scans due instances every 60 seconds (skipped when `REDIS_MODE=memory`). On breach the engine:

1. Marks the SLA instance `BREACHED`
2. Writes an `escalation_events` row
3. Sends in-app + email notifications
4. Writes an immutable audit log

## APIs

- `POST/GET /api/v1/sla/calendars`
- `POST /api/v1/sla/holidays`
- `POST/GET /api/v1/sla/configurations`
- `GET /api/v1/sla/instances`

# Authentication

## Endpoints

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/v1/auth/login` | Public |
| POST | `/api/v1/auth/refresh` | Public (refresh JWT) |
| POST | `/api/v1/auth/logout` | Access JWT |
| POST | `/api/v1/auth/change-password` | Access JWT |
| POST | `/api/v1/auth/forgot-password` | Public |
| POST | `/api/v1/auth/reset-password` | Public |
| GET | `/api/v1/auth/me` | Access JWT |
| POST | `/api/v1/auth/switch-tenant` | Super admin |

## Tokens

- Access JWT: short lived, used on `Authorization: Bearer`
- Refresh JWT: stored in Redis by `jti`, rotated on each refresh
- Reuse of a rotated refresh token revokes the token family
- Change-password and reset-password revoke all refresh tokens for the user
- Logout denies the access `jti` until expiry

## Login

Tenant users must send `tenantCode` because emails are unique per tenant, not globally.

Super admin logs in without `tenantCode`.

Failed passwords increment a counter. After the configured maximum, the account locks for `LOCKOUT_MINUTES`.

## Passwords

bcrypt with configurable rounds. New passwords require upper, lower, digit, and special character.

Forgot-password always returns a generic success message. The reset token is hashed (SHA-256) in Redis and emailed when SMTP is configured.

## Guards

- `JwtAuthGuard` — all private routes
- `RolesGuard` — `@Roles()`
- `PermissionsGuard` — `@RequirePermissions()`
- `TenantGuard` — tenant-scoped routes

`SUPER_ADMIN` bypasses role and permission checks. Tenant isolation still applies once they have switched into a tenant.

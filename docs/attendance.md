# Attendance

Punch identity is the employee linked to the JWT user. The client sends `siteId`, latitude, longitude, and optional accuracy. It does not send `employeeId`, `projectId`, or `tenantId`.

Punch-in checks:

1. Employee is active.
2. Site belongs to the tenant and is active.
3. An active site assignment covers the employee, site, and current time. `validTo` before `validFrom` is rejected at assignment time. An expired assignment is marked `EXPIRED`.
4. Distance from the site is within that site's `geofenceRadius`.
5. The employee does not already have an open punch-in.

An open punch-in is unique per employee. A second punch-in returns 409 until punch-out. Punch-out requires the open punch-in on the same site, closes it, stores an immutable `OUT` punch, and adds worked minutes on the attendance day.

Attendance is stored per employee, site, and date. Reports filter by date, employee, site, project, and status and aggregate in MongoDB.

Reading another employee's attendance requires `employees.read` in addition to `attendance.read`.

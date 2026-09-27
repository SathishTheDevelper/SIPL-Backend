# Additional site access

An employee can be assigned to many sites through `EmployeeSiteAssignment`. There is no single `employee.siteId`.

`POST /api/v1/site-access-requests` is for the signed-in employee. The site and its project must belong to the tenant. The request starts the tenant `SITE_ACCESS` workflow. The seed uses an HR role step and SLA hours from `SITE_ACCESS` configuration.

`POST /site-access-requests/:id/approve` and `reject` call the workflow engine. Reject requires a reason and creates no assignment. Approve, in one transaction, marks the request `APPROVED` and creates the site assignment for `requestedFrom`–`requestedTo`. The employee is notified and can then punch at that site.

Cancel is limited to the requesting employee while the request is `PENDING`.

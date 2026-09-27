export const SystemRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  TENANT_ADMIN: 'TENANT_ADMIN',
  MD: 'MD',
  DIRECTOR: 'DIRECTOR',
  PROJECT_HEAD: 'PROJECT_HEAD',
  SITE_ENGINEER: 'SITE_ENGINEER',
  SITE_MANAGER: 'SITE_MANAGER',
  HR: 'HR',
  PROCUREMENT: 'PROCUREMENT',
  PURCHASE: 'PURCHASE',
  SCM: 'SCM',
  ACCOUNTS: 'ACCOUNTS',
  FINANCE: 'FINANCE',
  EMPLOYEE: 'EMPLOYEE',
  VENDOR_USER: 'VENDOR_USER',
} as const;

export type SystemRoleCode = (typeof SystemRole)[keyof typeof SystemRole];

export const TENANT_ROLE_CODES: SystemRoleCode[] = [
  SystemRole.TENANT_ADMIN,
  SystemRole.MD,
  SystemRole.DIRECTOR,
  SystemRole.PROJECT_HEAD,
  SystemRole.SITE_ENGINEER,
  SystemRole.SITE_MANAGER,
  SystemRole.HR,
  SystemRole.PROCUREMENT,
  SystemRole.PURCHASE,
  SystemRole.SCM,
  SystemRole.ACCOUNTS,
  SystemRole.FINANCE,
  SystemRole.EMPLOYEE,
  SystemRole.VENDOR_USER,
];

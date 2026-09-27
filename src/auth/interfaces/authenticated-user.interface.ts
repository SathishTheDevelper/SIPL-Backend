export interface AuthenticatedUser {
  userId: string;
  tenantId: string | null;
  role: string;
  roleId: string;
  permissions: string[];
  email: string;
  isSuperAdmin: boolean;
  jti: string;
  exp?: number;
}

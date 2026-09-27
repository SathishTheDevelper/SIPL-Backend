export type TokenType = 'access' | 'refresh';

export interface JwtPayload {
  sub: string;
  tenantId: string | null;
  role: string;
  permissions: string[];
  type: TokenType;
  jti: string;
  family?: string;
  iat?: number;
  exp?: number;
}

import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import { ErrorCodes } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';
import { RedisService } from '../../redis/redis.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

const REFRESH_PREFIX = 'refresh:';
const FAMILY_PREFIX = 'refresh-family:';
const USER_PREFIX = 'refresh-user:';
const DENY_PREFIX = 'access-deny:';
const RESET_PREFIX = 'pwd-reset:';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async issuePair(params: {
    userId: string;
    tenantId: string | null;
    role: string;
    permissions: string[];
    family?: string;
  }): Promise<TokenPair> {
    const family = params.family ?? randomUUID();
    const accessJti = randomUUID();
    const refreshJti = randomUUID();
    const accessSecret =
      this.configService.getOrThrow<string>('jwt.accessSecret');
    const refreshSecret =
      this.configService.getOrThrow<string>('jwt.refreshSecret');
    const accessTtl = this.configService.get<string>('jwt.accessTtl', '15m');
    const refreshTtl = this.configService.get<string>('jwt.refreshTtl', '7d');
    const accessExpiresIn = accessTtl as
      number | `${number}m` | `${number}d` | `${number}h` | `${number}s`;
    const refreshExpiresIn = refreshTtl as
      number | `${number}m` | `${number}d` | `${number}h` | `${number}s`;

    const base = {
      sub: params.userId,
      tenantId: params.tenantId,
      role: params.role,
      permissions: params.permissions,
    };

    const accessToken = this.jwtService.sign(
      { ...base, type: 'access', jti: accessJti },
      { secret: accessSecret, expiresIn: accessExpiresIn },
    );
    const refreshToken = this.jwtService.sign(
      { ...base, type: 'refresh', jti: refreshJti, family },
      { secret: refreshSecret, expiresIn: refreshExpiresIn },
    );

    const refreshTtlSeconds = this.toSeconds(refreshTtl);
    await this.redis.set(
      `${REFRESH_PREFIX}${refreshJti}`,
      JSON.stringify({
        userId: params.userId,
        tenantId: params.tenantId,
        family,
      }),
      refreshTtlSeconds,
    );
    await this.redis.sadd(`${FAMILY_PREFIX}${family}`, refreshJti);
    await this.redis.sadd(`${USER_PREFIX}${params.userId}`, refreshJti);
    await this.redis.expire(`${FAMILY_PREFIX}${family}`, refreshTtlSeconds);
    await this.redis.expire(
      `${USER_PREFIX}${params.userId}`,
      refreshTtlSeconds,
    );

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  async rotate(refreshToken: string): Promise<TokenPair> {
    const payload = this.verifyRefresh(refreshToken);
    const stored = await this.redis.get(`${REFRESH_PREFIX}${payload.jti}`);
    if (!stored) {
      if (payload.family) {
        await this.revokeFamily(payload.family);
      }
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Refresh token reuse detected',
        ErrorCodes.TOKEN_REUSE_DETECTED,
      );
    }

    await this.redis.del(`${REFRESH_PREFIX}${payload.jti}`);
    if (payload.family) {
      await this.redis.srem(`${FAMILY_PREFIX}${payload.family}`, payload.jti);
    }
    await this.redis.srem(`${USER_PREFIX}${payload.sub}`, payload.jti);

    return this.issuePair({
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      permissions: payload.permissions,
      family: payload.family,
    });
  }

  verifyAccess(token: string): JwtPayload {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('jwt.accessSecret'),
      });
      if (payload.type !== 'access') {
        throw new Error('Invalid token type');
      }
      return payload;
    } catch {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Invalid access token',
        ErrorCodes.INVALID_TOKEN,
      );
    }
  }

  verifyRefresh(token: string): JwtPayload {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
      });
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
      return payload;
    } catch {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Invalid refresh token',
        ErrorCodes.INVALID_TOKEN,
      );
    }
  }

  async denyAccess(jti: string, exp?: number): Promise<void> {
    const ttl = exp ? Math.max(exp - Math.floor(Date.now() / 1000), 1) : 900;
    await this.redis.set(`${DENY_PREFIX}${jti}`, '1', ttl);
  }

  async isAccessDenied(jti: string): Promise<boolean> {
    return (await this.redis.get(`${DENY_PREFIX}${jti}`)) === '1';
  }

  async revokeRefresh(refreshToken: string): Promise<void> {
    try {
      const payload = this.verifyRefresh(refreshToken);
      await this.redis.del(`${REFRESH_PREFIX}${payload.jti}`);
      await this.redis.srem(`${USER_PREFIX}${payload.sub}`, payload.jti);
      if (payload.family) {
        await this.redis.srem(`${FAMILY_PREFIX}${payload.family}`, payload.jti);
      }
    } catch {
      return;
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const jtis = await this.redis.smembers(`${USER_PREFIX}${userId}`);
    if (jtis.length > 0) {
      await this.redis.del(...jtis.map((jti) => `${REFRESH_PREFIX}${jti}`));
    }
    await this.redis.del(`${USER_PREFIX}${userId}`);
  }

  async createPasswordResetToken(userId: string, tenantId: string | null) {
    const token =
      randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    const hash = this.hashToken(token);
    const ttl = this.configService.get<number>(
      'auth.passwordResetTtlSeconds',
      3600,
    );
    await this.redis.set(
      `${RESET_PREFIX}${hash}`,
      JSON.stringify({ userId, tenantId }),
      ttl,
    );
    return token;
  }

  async consumePasswordResetToken(token: string): Promise<{
    userId: string;
    tenantId: string | null;
  }> {
    const hash = this.hashToken(token);
    const raw = await this.redis.get(`${RESET_PREFIX}${hash}`);
    if (!raw) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Invalid or expired reset token',
        ErrorCodes.INVALID_TOKEN,
      );
    }
    await this.redis.del(`${RESET_PREFIX}${hash}`);
    return JSON.parse(raw) as { userId: string; tenantId: string | null };
  }

  private async revokeFamily(family: string): Promise<void> {
    const jtis = await this.redis.smembers(`${FAMILY_PREFIX}${family}`);
    if (jtis.length > 0) {
      await this.redis.del(...jtis.map((jti) => `${REFRESH_PREFIX}${jti}`));
    }
    await this.redis.del(`${FAMILY_PREFIX}${family}`);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) {
      return 7 * 24 * 60 * 60;
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === 's') return value;
    if (unit === 'm') return value * 60;
    if (unit === 'h') return value * 60 * 60;
    return value * 24 * 60 * 60;
  }
}

import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ErrorCodes } from '../../common/constants/error-codes';
import { SystemRole } from '../../common/constants/system-roles';
import { AppException } from '../../common/exceptions/app.exception';
import { UserStatus } from '../../users/enums/user-status.enum';
import { UsersService } from '../../users/services/users.service';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { TokenService } from '../services/token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.type !== 'access') {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Invalid access token',
        ErrorCodes.INVALID_TOKEN,
      );
    }

    if (await this.tokenService.isAccessDenied(payload.jti)) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Token has been revoked',
        ErrorCodes.INVALID_TOKEN,
      );
    }

    const user = await this.usersService.findAuthById(payload.sub);
    if (!user || user.status === UserStatus.INACTIVE || user.deletedAt) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Authentication required',
        ErrorCodes.UNAUTHORIZED,
      );
    }

    if (user.status === UserStatus.LOCKED) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Account is temporarily locked',
        ErrorCodes.ACCOUNT_LOCKED,
      );
    }

    if (
      payload.tenantId &&
      user.tenantId &&
      user.tenantId.toString() !== payload.tenantId
    ) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Authentication required',
        ErrorCodes.UNAUTHORIZED,
      );
    }

    if (
      user.passwordChangedAt &&
      payload.iat &&
      payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)
    ) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Token has been revoked',
        ErrorCodes.INVALID_TOKEN,
      );
    }

    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: user.role,
      roleId: user.roleId.toString(),
      permissions: user.permissions,
      email: user.email,
      isSuperAdmin: user.role === SystemRole.SUPER_ADMIN,
      jti: payload.jti,
      exp: payload.exp,
    };
  }
}

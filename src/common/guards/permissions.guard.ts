import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { ErrorCodes } from '../constants/error-codes';
import { SystemRole } from '../constants/system-roles';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AppException } from '../exceptions/app.exception';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Authentication required',
        ErrorCodes.UNAUTHORIZED,
      );
    }

    if (user.role === SystemRole.SUPER_ADMIN) {
      return true;
    }

    const granted = new Set(user.permissions);
    const allowed = required.every((permission) => granted.has(permission));
    if (!allowed) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Insufficient permissions',
        ErrorCodes.FORBIDDEN,
      );
    }

    return true;
  }
}

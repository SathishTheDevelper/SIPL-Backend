import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { TenantsService } from '../../tenants/services/tenants.service';
import { ErrorCodes } from '../constants/error-codes';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_TENANT_KEY } from '../decorators/skip-tenant.decorator';
import { AppException } from '../exceptions/app.exception';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantsService: TenantsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const skipTenant = this.reflector.getAllAndOverride<boolean>(
      SKIP_TENANT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skipTenant) {
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

    if (!user.tenantId) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Tenant context is required. Super admins must switch into a tenant first.',
        ErrorCodes.TENANT_CONTEXT_REQUIRED,
      );
    }

    const tenant = await this.tenantsService.findActiveById(user.tenantId);
    if (!tenant) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Tenant is not available',
        ErrorCodes.TENANT_INACTIVE,
      );
    }

    return true;
  }
}

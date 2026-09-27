import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { TenantContext, TenantStore } from '../context/tenant.context';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();
    const user = request.user;
    const store: TenantStore = {
      tenantId: user?.tenantId ?? null,
      userId: user?.userId ?? null,
      role: user?.role ?? null,
      permissions: user?.permissions ?? [],
      isSuperAdmin: user?.isSuperAdmin ?? false,
    };

    return new Observable((subscriber) => {
      TenantContext.run(store, () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (error: unknown) => subscriber.error(error),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}

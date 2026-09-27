import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  tenantId: string | null;
  userId: string | null;
  role: string | null;
  permissions: string[];
  isSuperAdmin: boolean;
}

const storage = new AsyncLocalStorage<TenantStore>();

export class TenantContext {
  static run<T>(store: TenantStore, callback: () => T): T {
    return storage.run(store, callback);
  }

  static getStore(): TenantStore | undefined {
    return storage.getStore();
  }

  static getTenantId(): string | null {
    return storage.getStore()?.tenantId ?? null;
  }

  static getUserId(): string | null {
    return storage.getStore()?.userId ?? null;
  }

  static getRole(): string | null {
    return storage.getStore()?.role ?? null;
  }

  static getPermissions(): string[] {
    return storage.getStore()?.permissions ?? [];
  }

  static isSuperAdmin(): boolean {
    return storage.getStore()?.isSuperAdmin ?? false;
  }

  static requireTenantId(): string {
    const tenantId = this.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context is required');
    }
    return tenantId;
  }
}

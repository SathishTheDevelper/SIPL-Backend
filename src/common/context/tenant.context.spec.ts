import { TenantContext } from './tenant.context';

describe('TenantContext', () => {
  it('exposes tenant data only inside run()', () => {
    expect(TenantContext.getTenantId()).toBeNull();

    TenantContext.run(
      {
        tenantId: 'tenant-a',
        userId: 'user-1',
        role: 'TENANT_ADMIN',
        permissions: ['users.read'],
        isSuperAdmin: false,
      },
      () => {
        expect(TenantContext.getTenantId()).toBe('tenant-a');
        expect(TenantContext.getUserId()).toBe('user-1');
        expect(TenantContext.requireTenantId()).toBe('tenant-a');
      },
    );

    expect(TenantContext.getTenantId()).toBeNull();
  });

  it('does not leak tenant context across concurrent runs', async () => {
    await Promise.all([
      new Promise<void>((resolve) => {
        TenantContext.run(
          {
            tenantId: 'A',
            userId: '1',
            role: 'HR',
            permissions: [],
            isSuperAdmin: false,
          },
          () => {
            expect(TenantContext.getTenantId()).toBe('A');
            resolve();
          },
        );
      }),
      new Promise<void>((resolve) => {
        TenantContext.run(
          {
            tenantId: 'B',
            userId: '2',
            role: 'HR',
            permissions: [],
            isSuperAdmin: false,
          },
          () => {
            expect(TenantContext.getTenantId()).toBe('B');
            resolve();
          },
        );
      }),
    ]);
  });
});

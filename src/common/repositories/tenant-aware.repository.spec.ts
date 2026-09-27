import { Types } from 'mongoose';
import { TenantContext } from '../context/tenant.context';
import { TenantAwareRepository } from './tenant-aware.repository';

class TestRepo extends TenantAwareRepository<{
  tenantId: Types.ObjectId;
  name: string;
}> {
  exposeScoped(filter: Record<string, unknown>) {
    return this.scoped(filter);
  }
}

describe('TenantAwareRepository', () => {
  const tenantA = new Types.ObjectId();
  const tenantB = new Types.ObjectId();

  const leanResult = { name: 'owned' };
  const model = {
    findOne: jest.fn().mockReturnValue({
      lean: () => ({
        exec: async () => leanResult,
      }),
    }),
  };

  const repo = new TestRepo(model as never);

  it('injects JWT tenantId into every query', () => {
    TenantContext.run(
      {
        tenantId: tenantA.toString(),
        userId: 'u1',
        role: 'TENANT_ADMIN',
        permissions: [],
        isSuperAdmin: false,
      },
      () => {
        const filter = repo.exposeScoped({ _id: 'abc' });
        expect(filter.tenantId?.toString()).toBe(tenantA.toString());
        expect(filter.tenantId?.toString()).not.toBe(tenantB.toString());
      },
    );
  });

  it('throws when tenant context is missing', () => {
    expect(() => repo.exposeScoped({})).toThrow();
  });
});

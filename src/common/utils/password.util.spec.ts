import { hashPassword, verifyPassword } from './password.util';

describe('password.util', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('TenantAdmin@12345', 4);
    expect(hash).not.toEqual('TenantAdmin@12345');
    await expect(verifyPassword('TenantAdmin@12345', hash)).resolves.toBe(true);
    await expect(verifyPassword('WrongPass@12345', hash)).resolves.toBe(false);
  });
});

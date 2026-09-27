import * as bcrypt from 'bcrypt';

export async function hashPassword(
  password: string,
  rounds: number,
): Promise<string> {
  return bcrypt.hash(password, rounds);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

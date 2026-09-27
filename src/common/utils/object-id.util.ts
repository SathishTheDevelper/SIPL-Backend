import { Types } from 'mongoose';

export function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

export function isObjectId(value: string): boolean {
  return (
    Types.ObjectId.isValid(value) && String(new Types.ObjectId(value)) === value
  );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

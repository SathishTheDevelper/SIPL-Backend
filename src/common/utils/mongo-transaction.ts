import { MongoServerError } from 'mongodb';
import { ClientSession, Connection } from 'mongoose';

export function isTransientTransactionError(error: unknown): boolean {
  if (error instanceof MongoServerError) {
    if (error.hasErrorLabel('TransientTransactionError')) return true;
    if (error.code === 112 || error.code === 251) return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('WriteConflict') ||
    message.includes('TransientTransactionError')
  );
}

export function isTransactionUnsupported(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Transaction numbers are only allowed') ||
    message.includes('replica set')
  );
}

export async function runInTransaction<T>(
  connection: Connection,
  fn: (session: ClientSession | undefined) => Promise<T>,
): Promise<T> {
  const session = await connection.startSession();
  try {
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction().catch(() => undefined);
    if (isTransactionUnsupported(error)) {
      return fn(undefined);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function runInTransactionWithRetry<T>(
  connection: Connection,
  fn: (session: ClientSession | undefined) => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await runInTransaction(connection, fn);
    } catch (error) {
      lastError = error;
      if (!isTransientTransactionError(error) || attempt === attempts - 1) {
        throw error;
      }
    }
  }
  throw lastError;
}

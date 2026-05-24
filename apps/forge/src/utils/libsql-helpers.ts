import type { createClient } from '@libsql/client';

/** Client that may have a close() method. */
export type ClosableLibsqlClient = ReturnType<typeof createClient> & {
  close?: () => void | Promise<void>;
};

/**
 * Close a libsql client safely.
 * Only calls close if the method exists (avoids errors on no-op clients).
 */
export async function closeLibsqlClient(client: ClosableLibsqlClient): Promise<void> {
  await client.close?.();
}

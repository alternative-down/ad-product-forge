/**
 * Typed Error subclasses for the system/reset module (Pattern L, D51 #6502 batch 11).
 *
 * Replaces 4 raw `throw new Error(...)` calls in system/reset.ts with 4 typed Error
 * subclasses (1-per-cluster) so consumers can use `err instanceof XError` instead
 * of parsing human-readable messages. See #6502.
 *
 * Pattern reference: apps/forge/src/email/migadu-manager.errors.ts (D51 #6502 batch 9),
 * apps/forge/src/github/manager.errors.ts (D51 #6502 batch 10).
 *
 * Migration impact: 4 literal `throw new Error(...)` calls in
 * apps/forge/src/system/reset.ts collapse to 4 typed Error classes.
 * Message format is preserved for backward compatibility with existing tests.
 */

export class DatabaseFileNotFoundError extends Error {
  readonly dbPath: string;

  constructor(dbPath: string) {
    super(`Database file not found at ${dbPath}`);
    this.name = 'DatabaseFileNotFoundError';
    this.dbPath = dbPath;
  }
}

export class DatabaseBackupFailedError extends Error {
  readonly dbPath: string;
  readonly backupPath: string;
  readonly originalError: string;

  constructor(dbPath: string, backupPath: string, originalError: string) {
    super(`Failed to backup database: ${originalError}`);
    this.name = 'DatabaseBackupFailedError';
    this.dbPath = dbPath;
    this.backupPath = backupPath;
    this.originalError = originalError;
  }
}

export class DatabaseBackupEmptyError extends Error {
  readonly backupPath: string;

  constructor(backupPath: string) {
    super(`Backup file is empty (0 bytes): ${backupPath}`);
    this.name = 'DatabaseBackupEmptyError';
    this.backupPath = backupPath;
  }
}

export class DatabaseWipeFailedError extends Error {
  readonly table: string;
  readonly alreadyWiped: readonly string[];
  readonly originalError: string;

  constructor(table: string, alreadyWiped: readonly string[], originalError: string) {
    super(
      `Failed to wipe table ${table} (already wiped: ${alreadyWiped.join(', ')}): ${originalError}`,
    );
    this.name = 'DatabaseWipeFailedError';
    this.table = table;
    this.alreadyWiped = alreadyWiped;
    this.originalError = originalError;
  }
}

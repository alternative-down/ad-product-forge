/**
 * Unit tests for system/reset.errors.ts.
 * All 4 exported error classes — 0 prior coverage.
 */
import { describe, expect, it } from 'vitest';

import {
  DatabaseFileNotFoundError,
  DatabaseBackupFailedError,
  DatabaseBackupEmptyError,
  DatabaseWipeFailedError,
} from './reset.errors';

describe('DatabaseFileNotFoundError', () => {
  it('has correct name and message', () => {
    const error = new DatabaseFileNotFoundError('/tmp/forge.db');
    expect(error.name).toBe('DatabaseFileNotFoundError');
    expect(error.message).toBe('Database file not found at /tmp/forge.db');
  });

  it('exposes dbPath field', () => {
    const error = new DatabaseFileNotFoundError('/tmp/x.db');
    expect(error.dbPath).toBe('/tmp/x.db');
  });

  it('is an instance of Error', () => {
    const error = new DatabaseFileNotFoundError('x');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('DatabaseBackupFailedError', () => {
  it('has correct name and message', () => {
    const error = new DatabaseBackupFailedError('/tmp/x.db', '/tmp/y.db', 'permission denied');
    expect(error.name).toBe('DatabaseBackupFailedError');
    expect(error.message).toBe('Failed to backup database: permission denied');
  });

  it('exposes dbPath, backupPath, originalError fields', () => {
    const error = new DatabaseBackupFailedError('a', 'b', 'c');
    expect(error.dbPath).toBe('a');
    expect(error.backupPath).toBe('b');
    expect(error.originalError).toBe('c');
  });

  it('is an instance of Error', () => {
    const error = new DatabaseBackupFailedError('a', 'b', 'c');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('DatabaseBackupEmptyError', () => {
  it('has correct name and message', () => {
    const error = new DatabaseBackupEmptyError('/tmp/y.db');
    expect(error.name).toBe('DatabaseBackupEmptyError');
    expect(error.message).toBe('Backup file is empty (0 bytes): /tmp/y.db');
  });

  it('exposes backupPath field', () => {
    const error = new DatabaseBackupEmptyError('/tmp/x.db');
    expect(error.backupPath).toBe('/tmp/x.db');
  });

  it('is an instance of Error', () => {
    const error = new DatabaseBackupEmptyError('x');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('DatabaseWipeFailedError', () => {
  it('has correct name and message with empty wipedTables', () => {
    const error = new DatabaseWipeFailedError('users', [], 'FK constraint');
    expect(error.name).toBe('DatabaseWipeFailedError');
    expect(error.message).toBe('Failed to wipe table users (already wiped: ): FK constraint');
  });

  it('has correct name and message with wipedTables list', () => {
    const error = new DatabaseWipeFailedError('users', ['sessions', 'tokens'], 'FK constraint');
    expect(error.message).toBe(
      'Failed to wipe table users (already wiped: sessions, tokens): FK constraint',
    );
  });

  it('exposes table, alreadyWiped, originalError fields', () => {
    const error = new DatabaseWipeFailedError('users', ['a'], 'c');
    expect(error.table).toBe('users');
    expect(error.alreadyWiped).toEqual(['a']);
    expect(error.originalError).toBe('c');
  });

  it('is an instance of Error', () => {
    const error = new DatabaseWipeFailedError('a', [], 'c');
    expect(error).toBeInstanceOf(Error);
  });
});

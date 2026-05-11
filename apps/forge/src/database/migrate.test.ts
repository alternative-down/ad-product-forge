import { beforeEach, describe, expect, test, vi } from 'vitest';

const debugCalls: { scope: string; level: string; message: string; context?: unknown }[] = [];

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(({ scope, level, message, context }) => {
    debugCalls.push({ scope, level, message, context });
  }),
}));

vi.mock('drizzle-orm/libsql/migrator', () => ({
  migrate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:path', () => ({
  join: vi.fn().mockReturnValue('/migrations'),
}));

vi.mock('../database/config', () => ({
  getAppDatabasePath: vi.fn().mockReturnValue('/data/app.db'),
}));

import { runMigrations } from './migrate';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

const mockDb = {
  all: vi.fn(),
} as unknown as LibSQLDatabase<Record<string, unknown>>;

describe('runMigrations', () => {
  beforeEach(() => {
    debugCalls.length = 0;
    vi.clearAllMocks();
  });

  test('calls migrate with correct folder path', async () => {
    const { migrate } = await import('drizzle-orm/libsql/migrator');
    await runMigrations(mockDb);

    expect(migrate).toHaveBeenCalledWith(mockDb, {
      migrationsFolder: '/migrations',
    });
  });

  test('logs info messages through forgeDebug', async () => {
    await runMigrations(mockDb);

    const infoCalls = debugCalls.filter((c) => c.level === 'info');
    const messages = infoCalls.map((c) => c.message);
    expect(messages).toContain('Running pending migrations for application database');
    expect(messages).toContain('Migrations completed successfully');
  });

  test('logs database path in context', async () => {
    await runMigrations(mockDb);

    const pathCall = debugCalls.find(
      (c) => c.message === 'Application database path',
    );
    expect(pathCall?.context).toMatchObject({
      databasePath: '/data/app.db',
    });
  });

  test('logs cwd in context', async () => {
    await runMigrations(mockDb);

    const cwdCall = debugCalls.find((c) => c.message === 'Working directory');
    expect(cwdCall?.context).toEqual({ cwd: expect.any(String) });
  });

  test('logs applied rows before migrate (calls db.all)', async () => {
    await runMigrations(mockDb);

    const beforeCall = debugCalls.find(
      (c) => c.message === 'Applied rows before migrate',
    );
    expect(beforeCall).toBeDefined();
    // db.all was called to get applied rows
    expect(mockDb.all).toHaveBeenCalled();
  });

  test('logs applied rows after migrate', async () => {
    await runMigrations(mockDb);

    const afterCall = debugCalls.find(
      (c) => c.message === 'Applied rows after migrate',
    );
    expect(afterCall).toBeDefined();
  });

  test('logs error with context when migrate throws', async () => {
    const { migrate } = await import('drizzle-orm/libsql/migrator');
    const error = new Error('SQLITE_CANTOPEN');
    vi.mocked(migrate).mockRejectedValueOnce(error);

    await expect(runMigrations(mockDb)).rejects.toThrow('SQLITE_CANTOPEN');

    const errorCall = debugCalls.find(
      (c) => c.message === 'Failed to run migrations',
    );
    expect(errorCall?.context).toMatchObject({ error });

    const atFailureCall = debugCalls.find(
      (c) => c.message === 'Applied rows at failure',
    );
    expect(atFailureCall).toBeDefined();
  });

  test('does not log success messages when migrate throws', async () => {
    const { migrate } = await import('drizzle-orm/libsql/migrator');
    vi.mocked(migrate).mockRejectedValueOnce(new Error('DB error'));

    try {
      await runMigrations(mockDb);
    } catch {
      // no-op: testing error path, suppress empty catch warning
    }

    const messages = debugCalls.map((c) => c.message);
    expect(messages).not.toContain('Migrations completed successfully');
    expect(messages).toContain('Failed to run migrations');
  });
});
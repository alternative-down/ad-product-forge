import { beforeEach, describe, expect, test, vi } from 'vitest';

const debugCalls: { scope: string; level: string; message: string; context?: unknown }[] = [];
const { readMigrationFilesMock } = vi.hoisted(() => ({
  readMigrationFilesMock: vi.fn().mockReturnValue([]),
}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(({ scope, level, message, context }) => {
    debugCalls.push({ scope, level, message, context });
  }),
}));

vi.mock('drizzle-orm/migrator', () => ({
  readMigrationFiles: readMigrationFilesMock,
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
  all: vi.fn().mockResolvedValue([]),
  run: vi.fn().mockResolvedValue(undefined),
} as unknown as LibSQLDatabase<Record<string, unknown>>;
function extractSqlText(sqlOrString: unknown): string {
  if (typeof sqlOrString === 'string') return sqlOrString.trim();
  const obj = sqlOrString as { queryChunks?: Array<{ value?: unknown }> } | null | undefined;
  if (!obj || !Array.isArray(obj.queryChunks)) return String(sqlOrString);
  let out = '';
  for (const chunk of obj.queryChunks) {
    if (chunk && typeof chunk === 'object' && 'value' in chunk) {
      const v = (chunk as { value: unknown }).value;
      if (typeof v === 'string') out += v;
      else if (Array.isArray(v)) out += v.map((p) => (typeof p === 'string' ? p : '?')).join('');
    }
  }
  return out.trim();
}


describe('runMigrations', () => {
  beforeEach(() => {
    debugCalls.length = 0;
    vi.clearAllMocks();
    readMigrationFilesMock.mockReturnValue([]);
  });

  test('reads migration files from the resolved folder path', async () => {
    await runMigrations(mockDb);

    expect(readMigrationFilesMock).toHaveBeenCalledWith({
      migrationsFolder: '/migrations',
    });
  });

  test('ensures the __drizzle_migrations bookkeeping table exists', async () => {
    await runMigrations(mockDb);

    const runCalls = (mockDb.run as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    const createdTable = runCalls.some((stmt) =>
      extractSqlText(stmt).toUpperCase().includes('CREATE TABLE IF NOT EXISTS __DRIZZLE_MIGRATIONS')
    );
    expect(createdTable).toBe(true);
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

    const pathCall = debugCalls.find((c) => c.message === 'Application database path');
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

    const beforeCall = debugCalls.find((c) => c.message === 'Applied rows before migrate');
    expect(beforeCall).toBeDefined();
    expect(mockDb.all).toHaveBeenCalled();
  });

  test('logs applied rows after migrate', async () => {
    await runMigrations(mockDb);

    const afterCall = debugCalls.find((c) => c.message === 'Applied rows after migrate');
    expect(afterCall).toBeDefined();
  });

  test('applies every pending migration one statement at a time', async () => {
    readMigrationFilesMock.mockReturnValue([
      {
        sql: ['CREATE TABLE foo (id text);', 'CREATE INDEX foo_idx ON foo (id);'],
        bps: true,
        folderMillis: 100,
        hash: 'aaa',
      },
      {
        sql: ['CREATE TABLE bar (id text);'],
        bps: true,
        folderMillis: 200,
        hash: 'bbb',
      },
    ]);

    await runMigrations(mockDb);

    const runCalls = (mockDb.run as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      extractSqlText(c[0])
    );
    expect(runCalls).toContain('CREATE TABLE foo (id text);');
    expect(runCalls).toContain('CREATE INDEX foo_idx ON foo (id);');
    expect(runCalls).toContain('CREATE TABLE bar (id text);');
    // Two __drizzle_migrations inserts (one per applied migration).
    const insertedMigrations = runCalls.filter((stmt) =>
      stmt.toUpperCase().includes('INSERT INTO __DRIZZLE_MIGRATIONS')
    );
    expect(insertedMigrations.length).toBe(2);
  });

  test('skips migrations whose hash is already in the applied set', async () => {
    (mockDb.all as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, hash: 'aaa', createdAt: 100 },
    ]);
    readMigrationFilesMock.mockReturnValue([
      { sql: ['CREATE TABLE foo (id text);'], bps: true, folderMillis: 100, hash: 'aaa' },
      { sql: ['CREATE TABLE bar (id text);'], bps: true, folderMillis: 200, hash: 'bbb' },
    ]);

    await runMigrations(mockDb);

    const runCalls = (mockDb.run as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      extractSqlText(c[0])
    );
    expect(runCalls).not.toContain('CREATE TABLE foo (id text);');
    expect(runCalls).toContain('CREATE TABLE bar (id text);');
  });

  test('skips empty statements between statement-breakpoints', async () => {
    readMigrationFilesMock.mockReturnValue([
      {
        sql: ['', '  ', 'CREATE TABLE baz (id text);', ''],
        bps: true,
        folderMillis: 300,
        hash: 'ccc',
      },
    ]);

    await runMigrations(mockDb);

    const runCalls = (mockDb.run as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      extractSqlText(c[0])
    );
    expect(runCalls).toContain('CREATE TABLE baz (id text);');
    // The bookkeeping INSERT should still happen once.
    const insertedMigrations = runCalls.filter((stmt) =>
      stmt.toUpperCase().includes('INSERT INTO __DRIZZLE_MIGRATIONS')
    );
    expect(insertedMigrations.length).toBe(1);
  });

  test('logs error with context when migrate throws', async () => {
    (mockDb.run as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('SQLITE_CANTOPEN');
    });
    readMigrationFilesMock.mockReturnValue([
      { sql: ['CREATE TABLE foo (id text);'], bps: true, folderMillis: 100, hash: 'aaa' },
    ]);

    await expect(runMigrations(mockDb)).rejects.toThrow('SQLITE_CANTOPEN');

    const errorCall = debugCalls.find((c) => c.message === 'Failed to run migrations');
    expect(errorCall?.context).toMatchObject({ error: expect.stringContaining('SQLITE_CANTOPEN') });

    const atFailureCall = debugCalls.find((c) => c.message === 'Applied rows at failure');
    expect(atFailureCall).toBeDefined();
  });

  test('does not log success messages when migrate throws', async () => {
    (mockDb.run as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('DB error');
    });
    readMigrationFilesMock.mockReturnValue([
      { sql: ['CREATE TABLE foo (id text);'], bps: true, folderMillis: 100, hash: 'aaa' },
    ]);

    await expect(runMigrations(mockDb)).rejects.toThrow('DB error');

    const messages = debugCalls.map((c) => c.message);
    expect(messages).not.toContain('Migrations completed successfully');
    expect(messages).toContain('Failed to run migrations');
  });

  test('applies a new migration even when its folderMillis is lower than an already-applied one', async () => {
    // This is the production scenario: the journal entry order is the source of
    // truth, not the folderMillis values. Migration with hash 'old' was applied
    // earlier with a HIGH folderMillis (e.g. 1780485628386). A new migration
    // 'new' arrives with a LOWER folderMillis (e.g. 1780450958800) because its
    // 'when' was generated against an earlier baseline. The hash-based check
    // must still apply it.
    (mockDb.all as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, hash: 'old', createdAt: 1_780_485_628_386 },
    ]);
    readMigrationFilesMock.mockReturnValue([
      { sql: ['CREATE TABLE old_stuff (id text);'], bps: true, folderMillis: 1_780_485_628_386, hash: 'old' },
      { sql: ['CREATE TABLE new_stuff (id text);'], bps: true, folderMillis: 1_780_450_958_800, hash: 'new' },
    ]);

    await runMigrations(mockDb);

    const runCalls = (mockDb.run as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      extractSqlText(c[0])
    );
    expect(runCalls).not.toContain('CREATE TABLE old_stuff (id text);');
    expect(runCalls).toContain('CREATE TABLE new_stuff (id text);');
  });
});

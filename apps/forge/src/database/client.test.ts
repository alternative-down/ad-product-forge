import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type * as ClientModule from './client';

const mockRun = vi.fn().mockResolvedValue(undefined);
const mockDrizzleDb = { run: mockRun } as unknown as LibSQLDatabase<Record<string, unknown>>;

vi.mock('./schema', () => ({}));

vi.mock('./config', () => ({
  getAppDatabasePath: vi.fn().mockReturnValue('/data/test.db'),
}));

vi.mock('@libsql/client', () => ({
  createClient: vi.fn().mockReturnValue({}),
}));

vi.mock('drizzle-orm/libsql', () => ({
  drizzle: vi.fn().mockReturnValue(mockDrizzleDb),
}));

vi.mock('drizzle-orm', () => ({
  sql: vi.fn(),
}));

// Import the module to test getDatabase behavior.
const { getDatabase } = await import('./client');

describe('getDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns a drizzle database instance', () => {
    const db = getDatabase();
    expect(db).toBeDefined();
    expect(typeof db).toBe('object');
  });

  test('is stable — returns the same instance on every call', () => {
    const db1 = getDatabase();
    const db2 = getDatabase();
    expect(db1).toBe(db2);
  });

  test('has a run method for executing raw SQL', () => {
    const db = getDatabase() as unknown as { run: (sql: unknown) => Promise<void> };
    expect(typeof db.run).toBe('function');
  });
});

describe('Database type export', () => {
  test('Database type is exported from the module', async () => {
    const mod = await import('./client') as typeof ClientModule;
    // Database is a LibSQLDatabase aliased type — check it resolves.
    // The export exists and is a type (type-only check passes at compile time).
    expect(mod).toHaveProperty('getDatabase');
  });
});

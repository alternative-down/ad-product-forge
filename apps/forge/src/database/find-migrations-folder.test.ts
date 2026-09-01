import { describe, test, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { findMigrationsFolder } from './find-migrations-folder';

describe('findMigrationsFolder (L#19 tripwire for #5674 P0, extracted per #6761)', () => {
  test('dev layout: finds migrations from src/database/', () => {
    const devStart = dirname(new URL(import.meta.url).pathname);
    const result = findMigrationsFolder(devStart);
    expect(result.endsWith('migrations')).toBe(true);
    expect(result.endsWith('apps/forge/migrations')).toBe(true);
  });

  test('bundled layout: finds migrations from dist/database/', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'forge-mig-test-'));
    try {
      const fakeDbDir = join(tmp, 'dist', 'database');
      const fakeMigDir = join(tmp, 'dist', 'migrations');
      const fakeMetaDir = join(fakeMigDir, 'meta');
      const fs = require('node:fs') as typeof import('node:fs');
      fs.mkdirSync(fakeDbDir, { recursive: true });
      fs.mkdirSync(fakeMetaDir, { recursive: true });
      fs.writeFileSync(join(fakeMetaDir, '_journal.json'), '{"version":"7"}');

      const result = findMigrationsFolder(fakeDbDir);
      expect(result).toBe(fakeMigDir);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('throws MigrationsJournalNotFoundError when not found', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'forge-mig-no-journal-'));
    try {
      expect(() => findMigrationsFolder(tmp)).toThrow();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('throws typed error matching migrate.ts behavior', async () => {
    const { MigrationsJournalNotFoundError } = await import('./migrate.errors');
    const tmp = mkdtempSync(join(tmpdir(), 'forge-mig-typed-'));
    try {
      try {
        findMigrationsFolder(tmp);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(MigrationsJournalNotFoundError);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

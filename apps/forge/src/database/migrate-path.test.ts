import { describe, test, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { findMigrationsFolder } from './migrate';

describe('findMigrationsFolder (L#19 tripwire for #5674 P0)', () => {
  test('dev layout: finds migrations from src/database/', () => {
    // Resolve from the test file's location, simulating the SOURCE layout
    // (this test file IS at src/database/, so import.meta.dirname of the
    // function under test matches the dev layout)
    const devStart = dirname(new URL(import.meta.url).pathname);
    const result = findMigrationsFolder(devStart);
    // Dev: src/database/ -> apps/forge/migrations/ (2 levels up)
    expect(result.endsWith('migrations')).toBe(true);
    expect(result.endsWith('apps/forge/migrations')).toBe(true);
  });

  test('bundled layout: finds migrations from dist/database/', () => {
    // Simulate the BUNDLED layout: dist/database/ has dist/migrations/ as
    // its sibling. Walk up 1 level from a fake dist/database/ should find it.
    const tmp = mkdtempSync(join(tmpdir(), 'forge-mig-test-'));
    try {
      // Create fake bundled layout: tmp/dist/database/ + tmp/dist/migrations/meta/_journal.json
      const fakeDbDir = join(tmp, 'dist', 'database');
      const fakeMigDir = join(tmp, 'dist', 'migrations');
      const fakeMetaDir = join(fakeMigDir, 'meta');
      const fs = require('node:fs') as typeof import('node:fs');
      fs.mkdirSync(fakeDbDir, { recursive: true });
      fs.mkdirSync(fakeMetaDir, { recursive: true });
      fs.writeFileSync(join(fakeMetaDir, '_journal.json'), '{"version":"7"}');

      const result = findMigrationsFolder(fakeDbDir);
      // Should find tmp/dist/migrations
      expect(result).toBe(fakeMigDir);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('throws when migrations folder not found within 5 levels', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'forge-mig-empty-'));
    try {
      // Empty temp dir with no migrations/ anywhere
      expect(() => findMigrationsFolder(tmp)).toThrow(
        /migrations\/meta\/_journal\.json not found/,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('does NOT use hardcoded .. .. path (L#NN-16 regression guard)', () => {
    // This is the negative test: if someone reverts to the buggy
    // `join(import.meta.dirname, '..', '..', 'migrations')`, the bundled
    // layout test (above) would fail because dist/database/ + ../../migrations
    // would point to <grandparent>/migrations (NOT dist/migrations/).
    // We assert here that the bundled-layout test catches that case.
    const source = readFileSource();
    expect(source).not.toMatch(
      /join\(import\.meta\.dirname,\s*['"]\.\.['"],\s*['"]\.\.['"],\s*['"]migrations['"]\)/,
    );
    expect(source).toMatch(/findMigrationsFolder\(import\.meta\.dirname\)/);
  });
});

// Helper to read the source of migrate.ts for negative assertions
function readFileSource(): string {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const { resolve } = require('node:path') as typeof import('node:path');
  const sourcePath = resolve(dirname(new URL(import.meta.url).pathname), 'migrate.ts');
  return readFileSync(sourcePath, 'utf-8');
}

describe('L#NN-16 sibling audit (fixed in #5686, walk-up search applied)', () => {
  test('bundled-workspace-skills.ts uses findSkillsFolder walk-up (L#NN-16 fix #5686)', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const pathMod = require('node:path') as typeof import('node:path');
    const filePath = pathMod.resolve(
      dirname(new URL(import.meta.url).pathname),
      '..',
      'agents',
      'bundled-workspace-skills.ts',
    );
    const source = fs.readFileSync(filePath, 'utf-8');
    // Fixed in #5686: walk-up search replaces the hardcoded candidate roots.
    // The file should now use findSkillsFolder(MODULE_DIRECTORY) and should
    // NOT have the TODO marker or the candidateRoots array (L#NN-16 anti-pattern).
    expect(source).toMatch(/findSkillsFolder\(MODULE_DIRECTORY\)/);
    expect(source).not.toMatch(/TODO\(#5677\)/);
    expect(source).not.toMatch(/candidateRoots/);
  });
});

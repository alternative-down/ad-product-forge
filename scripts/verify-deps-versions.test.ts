/**
 * Tests for scripts/verify-deps-versions.js — getPackageJson() and collectDependencies()
 * Closes #5743 — scripts/ folder test coverage
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getPackageJson,
  collectDependencies,
} from './verify-deps-versions.js';

describe('scripts/verify-deps-versions', () => {
  describe('getPackageJson', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'verify-deps-test-'));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('reads and parses a valid package.json', () => {
      const pkgJson = { name: 'test', version: '1.0.0' };
      writeFileSync(join(tempDir, 'package.json'), JSON.stringify(pkgJson));
      const result = getPackageJson(tempDir);
      expect(result).toEqual(pkgJson);
    });

    it('returns null for a missing package.json', () => {
      const result = getPackageJson(join(tempDir, 'nonexistent'));
      expect(result).toBeNull();
    });

    it('returns null for a malformed package.json', () => {
      writeFileSync(join(tempDir, 'package.json'), '{ invalid json }');
      const result = getPackageJson(tempDir);
      expect(result).toBeNull();
    });

    it('handles an empty package.json (just {})', () => {
      writeFileSync(join(tempDir, 'package.json'), '{}');
      const result = getPackageJson(tempDir);
      expect(result).toEqual({});
    });
  });

  describe('collectDependencies', () => {
    it('returns empty object for a package.json with no deps', () => {
      const result = collectDependencies({}, 'pkg-a');
      expect(result).toEqual({});
    });

    it('collects a single dependency from dependencies field', () => {
      const pkgJson = { dependencies: { react: '^18.3.1' } };
      const result = collectDependencies(pkgJson, 'pkg-a');
      expect(result).toEqual({ react: { 'pkg-a': '^18.3.1' } });
    });

    it('collects from all 3 dep fields: dependencies, devDependencies, peerDependencies', () => {
      const pkgJson = {
        dependencies: { react: '^18.3.1' },
        devDependencies: { vitest: '^1.0.0' },
        peerDependencies: { typescript: '^5.0.0' },
      };
      const result = collectDependencies(pkgJson, 'pkg-a');
      expect(result).toEqual({
        react: { 'pkg-a': '^18.3.1' },
        vitest: { 'pkg-a': '^1.0.0' },
        typescript: { 'pkg-a': '^5.0.0' },
      });
    });

    it('does NOT collect from optionalDependencies (known gap documented in #5743)', () => {
      // This documents a known limitation: optionalDependencies are intentionally
      // excluded. The fix is out of scope for this PR; the test prevents future
      // regressions of the 3-field limit.
      const pkgJson = {
        dependencies: { react: '^18.3.1' },
        optionalDependencies: { fsevents: '^2.0.0' },
      };
      const result = collectDependencies(pkgJson, 'pkg-a');
      expect(result).toEqual({ react: { 'pkg-a': '^18.3.1' } });
      expect(result.fsevents).toBeUndefined();
    });

    it('preserves the package name as the inner key', () => {
      const pkgJson = { dependencies: { lodash: '^4.17.21' } };
      const result = collectDependencies(pkgJson, 'my-cool-pkg');
      expect(result).toEqual({ lodash: { 'my-cool-pkg': '^4.17.21' } });
    });
  });

  describe('L#NN-26 v1 mutation (non-tautological)', () => {
    it('mutation: removing one dep field changes output (3-field invariant)', () => {
      const pkgJson = {
        dependencies: { react: '^18.3.1' },
        devDependencies: { vitest: '^1.0.0' },
        peerDependencies: { typescript: '^5.0.0' },
      };
      const fullResult = collectDependencies(pkgJson, 'pkg-a');
      // If the script only collected from `dependencies`, peer/dev deps would be missing
      expect(Object.keys(fullResult)).toHaveLength(3);

      // Simulate removing the peerDependencies collection: only 2 entries
      const partial = {
        dependencies: { react: '^18.3.1' },
        devDependencies: { vitest: '^1.0.0' },
      };
      const partialResult = collectDependencies(partial, 'pkg-a');
      expect(Object.keys(partialResult)).toHaveLength(2);
    });
  });
});

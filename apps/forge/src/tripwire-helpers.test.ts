/**
 * L#NN-50 tripwire helpers — unit tests.
 *
 * These tests pin the behavior of each helper exported from __tripwire-helpers.ts.
 * If you change a helper, you MUST update these tests AND verify that all
 * migrated tripwires still pass.
 *
 * L#NN-26 v1 mutation: VERIFIED non-tautological for each helper. The test
 * assertions are not just "exists" checks — they pin specific return values
 * for specific inputs.
 */

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  readSource,
  findSourceFiles,
  countMatches,
  findAll,
  stripComments,
  stripIntentionalLines,
  relativeToHere,
} from './tripwire-helpers';

describe('L#NN-50 tripwire helpers — unit tests (#5782)', () => {
  describe('readSource', () => {
    let tmpDir: string;
    beforeEach(() => {
      tmpDir = join(tmpdir(), `tripwire-helper-test-${Date.now()}-${Math.random()}`);
      mkdirSync(tmpDir, { recursive: true });
    });
    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reads a file as UTF-8', () => {
      const file = join(tmpDir, 'sample.ts');
      writeFileSync(file, 'const x = 42;\n');
      expect(readSource(file)).toBe('const x = 42;\n');
    });

    it('returns the full file content (not stripped)', () => {
      const file = join(tmpDir, 'sample.ts');
      writeFileSync(file, '// comment\nconst x = 42;\n');
      expect(readSource(file)).toBe('// comment\nconst x = 42;\n');
    });

    it('throws on non-existent file (caller handles ENOENT)', () => {
      expect(() => readSource(join(tmpDir, 'missing.ts'))).toThrow();
    });
  });

  describe('findSourceFiles', () => {
    let tmpDir: string;
    beforeEach(() => {
      tmpDir = join(tmpdir(), `tripwire-helper-test-${Date.now()}-${Math.random()}`);
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(join(tmpDir, 'a.ts'), '');
      writeFileSync(join(tmpDir, 'b.ts'), '');
      writeFileSync(join(tmpDir, 'c.test.ts'), '');
      writeFileSync(join(tmpDir, '__tripwire.ts'), '');
      writeFileSync(join(tmpDir, 'd.txt'), '');
    });
    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('finds .ts files and excludes .test.ts by default', () => {
      const files = findSourceFiles(tmpDir);
      const basenames = files.map((f) => f.split('/').pop());
      expect(basenames).toContain('a.ts');
      expect(basenames).toContain('b.ts');
      expect(basenames).not.toContain('c.test.ts');
    });

    it('excludes __-prefixed files by default (tripwire-marker)', () => {
      const files = findSourceFiles(tmpDir);
      const basenames = files.map((f) => f.split('/').pop());
      expect(basenames).not.toContain('__tripwire.ts');
    });

    it('excludes non-.ts files (e.g., .txt)', () => {
      const files = findSourceFiles(tmpDir);
      const basenames = files.map((f) => f.split('/').pop());
      expect(basenames).not.toContain('d.txt');
    });

    it('respects excludeTest: false (includes .test.ts)', () => {
      const files = findSourceFiles(tmpDir, { excludeTest: false });
      const basenames = files.map((f) => f.split('/').pop());
      expect(basenames).toContain('c.test.ts');
    });

    it('respects custom excludePrefixes', () => {
      const files = findSourceFiles(tmpDir, { excludePrefixes: ['a'] });
      const basenames = files.map((f) => f.split('/').pop());
      expect(basenames).not.toContain('a.ts');
      expect(basenames).toContain('b.ts');
    });
  });

  describe('countMatches', () => {
    it('returns the count of regex matches', () => {
      expect(countMatches('aaa', /a/g)).toBe(3);
    });

    it('returns 0 for no matches', () => {
      expect(countMatches('xyz', /a/g)).toBe(0);
    });

    it('returns 1 for a single match (no /g flag, returns first only)', () => {
      // No /g: match returns null for no-match, or the first match array.
      // For 'aaa' and /a/, returns ['a'] (length 1), not 3.
      expect(countMatches('aaa', /a/)).toBe(1);
    });

    it('handles complex regex', () => {
      const src = 'forgeDebug({ scope: "a" }) forgeDebug({ scope: "b" })';
      const count = countMatches(src, /forgeDebug\(\s*\{\s*scope:\s*"/g);
      expect(count).toBe(2);
    });
  });

  describe('findAll', () => {
    it('returns an array of all matches', () => {
      const matches = findAll('aaa', /a/g);
      expect(matches).toHaveLength(3);
      matches.forEach((m) => expect(m[0]).toBe('a'));
    });

    it('returns an empty array for no matches', () => {
      expect(findAll('xyz', /a/g)).toEqual([]);
    });

    it('captures groups correctly', () => {
      const src = 'foo(1) bar(2) baz(3)';
      const matches = findAll(src, /(\w+)\((\d+)\)/g);
      expect(matches).toHaveLength(3);
      expect(matches[0]?.[1]).toBe('foo');
      expect(matches[1]?.[2]).toBe('2');
    });
  });

  describe('stripComments', () => {
    it('strips single-line comments', () => {
      const src = 'const x = 1; // comment\nconst y = 2;';
      expect(stripComments(src)).toBe('const x = 1; \nconst y = 2;');
    });

    it('strips block comments', () => {
      const src = 'const x = 1; /* block */\nconst y = 2;';
      expect(stripComments(src)).toBe('const x = 1; \nconst y = 2;');
    });

    it('strips multi-line block comments', () => {
      const src = 'const x = 1;\n/* line 1\n   line 2\n   line 3 */\nconst y = 2;';
      const stripped = stripComments(src);
      expect(stripped).not.toContain('line 1');
      expect(stripped).toContain('const x = 1;');
      expect(stripped).toContain('const y = 2;');
    });

    it('preserves non-comment code', () => {
      const src = 'const x = 42;';
      expect(stripComments(src)).toBe('const x = 42;');
    });
  });

  describe('stripIntentionalLines', () => {
    it('removes lines containing the marker', () => {
      const src = 'line 1\nline 2 // INTENTIONAL DIRECT LOG\nline 3';
      const stripped = stripIntentionalLines(src, 'INTENTIONAL DIRECT LOG');
      expect(stripped).toBe('line 1\nline 3');
    });

    it('preserves lines without the marker', () => {
      const src = 'keep 1\nkeep 2\nkeep 3';
      expect(stripIntentionalLines(src, 'INTENTIONAL DIRECT LOG')).toBe(src);
    });

    it('removes ALL matching lines (no whitelist)', () => {
      const src = 'a // MARK\nb // MARK\nc';
      expect(stripIntentionalLines(src, 'MARK')).toBe('c');
    });
  });

  describe('relativeToHere', () => {
    it('resolves a path relative to this file directory', () => {
      const result = relativeToHere('foo.ts');
      // The result should be an absolute path ending in 'foo.ts'
      expect(result.endsWith('foo.ts')).toBe(true);
      // And should not contain '..' (i.e., it's been resolved)
      expect(result.includes('..')).toBe(false);
    });

    it('handles nested paths', () => {
      const result = relativeToHere('subdir', 'nested', 'file.ts');
      expect(result.endsWith(join('subdir', 'nested', 'file.ts'))).toBe(true);
    });
  });
});

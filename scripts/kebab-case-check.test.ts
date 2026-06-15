/**
 * Tests for scripts/kebab-case-check.js — isKebabCase() function
 * Closes #5743 — scripts/ folder test coverage + kebab-case-check.js header bug fix
 */
import { describe, it, expect } from 'vitest';
import { isKebabCase } from './kebab-case-check.js';

describe('scripts/kebab-case-check', () => {
  describe('isKebabCase — positive cases (kebab-case filenames)', () => {
    it('accepts simple kebab-case .ts files', () => {
      expect(isKebabCase('my-file.ts')).toBe(true);
      expect(isKebabCase('component.tsx')).toBe(true);
      expect(isKebabCase('config.types.ts')).toBe(true);
    });

    it('accepts single-word filenames (lowercase)', () => {
      expect(isKebabCase('route.ts')).toBe(true);
      expect(isKebabCase('index.js')).toBe(true);
      expect(isKebabCase('main.jsx')).toBe(true);
    });

    it('accepts files with digits in kebab-case', () => {
      expect(isKebabCase('file-v2.ts')).toBe(true);
      expect(isKebabCase('trip-13a.test.ts')).toBe(true);
      expect(isKebabCase('config-2024-06.ts')).toBe(true);
    });

    it('accepts all 4 supported extensions', () => {
      expect(isKebabCase('foo.ts')).toBe(true);
      expect(isKebabCase('foo.tsx')).toBe(true);
      expect(isKebabCase('foo.js')).toBe(true);
      expect(isKebabCase('foo.jsx')).toBe(true);
    });
  });

  describe('isKebabCase — negative cases (non-kebab-case filenames)', () => {
    it('rejects PascalCase', () => {
      expect(isKebabCase('MyFile.ts')).toBe(false);
      expect(isKebabCase('Component.tsx')).toBe(false);
    });

    it('rejects camelCase', () => {
      expect(isKebabCase('myFile.ts')).toBe(false);
      expect(isKebabCase('myComponent.tsx')).toBe(false);
    });

    it('rejects snake_case', () => {
      expect(isKebabCase('my_file.ts')).toBe(false);
      expect(isKebabCase('my_test_file.tsx')).toBe(false);
    });

    it('rejects filenames starting with uppercase', () => {
      expect(isKebabCase('Index.ts')).toBe(false);
      expect(isKebabCase('ROUTE.ts')).toBe(false);
    });

    it('rejects filenames starting with a digit', () => {
      expect(isKebabCase('123file.ts')).toBe(false);
      expect(isKebabCase('9-foo.ts')).toBe(false);
    });
  });

  describe('isKebabCase — special exceptions', () => {
    it('accepts index.{ts,tsx,js,jsx} as barrel files', () => {
      expect(isKebabCase('index.ts')).toBe(true);
      expect(isKebabCase('index.tsx')).toBe(true);
      expect(isKebabCase('index.js')).toBe(true);
      expect(isKebabCase('index.jsx')).toBe(true);
    });

    it('accepts route.{ts,tsx,js,jsx} as TanStack Router convention', () => {
      expect(isKebabCase('route.ts')).toBe(true);
      expect(isKebabCase('route.tsx')).toBe(true);
      expect(isKebabCase('route.js')).toBe(true);
      expect(isKebabCase('route.jsx')).toBe(true);
    });

    it('accepts routeTree.gen.ts as TanStack auto-generated', () => {
      expect(isKebabCase('routeTree.gen.ts')).toBe(true);
    });

    it('accepts __root.tsx as TanStack Router root', () => {
      expect(isKebabCase('__root.tsx')).toBe(true);
    });

    it('accepts test/spec files with .test. or .spec. extension', () => {
      expect(isKebabCase('my-file.test.ts')).toBe(true);
      expect(isKebabCase('component.spec.tsx')).toBe(true);
      expect(isKebabCase('trip-13a.test.ts')).toBe(true);
    });

    it('accepts {name}.config.{ext} and {name}.types.{ext} for Vite/TS configs', () => {
      expect(isKebabCase('vite.config.ts')).toBe(true);
      expect(isKebabCase('vitest.config.ts')).toBe(true);
      expect(isKebabCase('my-app.types.ts')).toBe(true);
    });

    it('accepts dotfiles (hidden files starting with .)', () => {
      expect(isKebabCase('.gitignore')).toBe(true);
      expect(isKebabCase('.eslintrc.js')).toBe(true);
    });
  });

  describe('isKebabCase — L#NN-26 v1 mutation (non-tautological)', () => {
    it('mutation: removing a special-case rule changes behavior (PascalCase test fails without PascalCase rule)', () => {
      // Sanity: PascalCase is currently rejected
      expect(isKebabCase('PascalCase.ts')).toBe(false);
      // If the regex `/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.(tsx?|ts|jsx?|js)$/` were weakened
      // (e.g., changed to `/^.*\.(tsx?|ts|jsx?|js)$/`), PascalCase would pass.
      // This test documents the invariant: the strict regex is required.
      expect(isKebabCase('Some-Pascal-Kebab.ts')).toBe(false); // contains uppercase
    });
  });
});

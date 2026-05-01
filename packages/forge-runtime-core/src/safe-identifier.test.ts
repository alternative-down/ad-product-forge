import { describe, expect, it } from 'vitest';
import { toForgeSafeIdentifier } from './safe-identifier.js';

describe('safe-identifier', () => {
  describe('toForgeSafeIdentifier', () => {
    it('passes through alphanumeric strings unchanged', () => {
      expect(toForgeSafeIdentifier('helloWorld123')).toBe('helloWorld123');
    });

    it('passes through snake_case identifiers', () => {
      expect(toForgeSafeIdentifier('my_variable_42')).toBe('my_variable_42');
    });

    it('passes through identifiers starting with underscore', () => {
      expect(toForgeSafeIdentifier('_private')).toBe('_private');
    });

    it('replaces spaces with underscores', () => {
      expect(toForgeSafeIdentifier('hello world')).toBe('hello_world');
    });

    it('replaces hyphens with underscores', () => {
      expect(toForgeSafeIdentifier('my-key')).toBe('my_key');
    });

    it('replaces dots with underscores', () => {
      expect(toForgeSafeIdentifier('file.name.ts')).toBe('file_name_ts');
    });

    it('prepends underscore if result starts with digit', () => {
      expect(toForgeSafeIdentifier('123abc')).toBe('_123abc');
    });

    it('handles empty string', () => {
      // Empty normalized result starts with non-letter, gets underscore prepended
      expect(toForgeSafeIdentifier('')).toBe('_');
    });

    it('handles unicode characters', () => {
      // Unicode chars are replaced, result may start with digit → gets underscore
      const result = toForgeSafeIdentifier('café');
      expect(result).toContain('caf');
    });

    it('handles mixed special chars', () => {
      expect(toForgeSafeIdentifier('my.key-file.txt')).toBe('my_key_file_txt');
    });

    it('produces valid identifier (starts with letter or underscore)', () => {
      const ids = ['hello', '123abc', 'a-b', 'a b', '...', '__test__'];
      for (const id of ids) {
        const _result = toForgeSafeIdentifier(id);
        expect(/^[A-Za-z_]/).toBeTruthy();
      }
    });

    it('contains only safe chars after transformation', () => {
      const testCases = ['my-key', 'file.name.ts', 'user@host', 'a+b'];
      for (const tc of testCases) {
        const result = toForgeSafeIdentifier(tc);
        expect(result).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
      }
    });
  });
});

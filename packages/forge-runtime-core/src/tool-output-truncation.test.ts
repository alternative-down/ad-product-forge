import { describe, expect, it } from 'vitest';
import { truncateToolOutputValue } from './tool-output-truncation.js';

describe('truncateToolOutputValue', () => {
  describe('strings', () => {
    it('returns string unchanged when below limits', () => {
      expect(truncateToolOutputValue('short output')).toBe('short output');
    });

    it('truncates string exceeding char limit', () => {
      const input = 'a'.repeat(10_000);
      const result = truncateToolOutputValue(input) as string;
      expect(result.length).toBeLessThan(input.length);
      expect(result).toContain('truncated tool output');
    });

    it('truncates string exceeding line limit', () => {
      const input = Array(200).fill('line').join('\n');
      const result = truncateToolOutputValue(input) as string;
      expect(result).not.toBe(input);
      expect(result).toContain('truncated tool output');
    });

    it('returns string unchanged at exact char boundary', () => {
      const input = 'a'.repeat(8_000);
      expect(truncateToolOutputValue(input)).toBe(input);
    });
  });

  describe('arrays', () => {
    it('returns array unchanged when within item limit', () => {
      const input = Array(20).fill({ value: 1 });
      expect(truncateToolOutputValue(input)).toEqual(input);
    });

    it('truncates array exceeding item limit', () => {
      const input = Array(50).fill('item');
      const result = truncateToolOutputValue(input) as unknown[];
      expect(result.length).toBeLessThan(input.length);
      const marker = result[result.length - 1] as Record<string, unknown>;
      expect(marker.truncated).toBe(true);
    });

    it('truncates nested arrays', () => {
      const input = [[Array(50).fill('deep')]];
      const result = truncateToolOutputValue(input) as unknown[];
      const inner = result[0] as unknown[];
      expect(inner.length).toBeLessThan(50);
    });

    it('truncates long strings inside arrays', () => {
      const input = Array(10).fill('a'.repeat(10_000));
      const result = truncateToolOutputValue(input) as unknown[];
      expect((result[0] as string).length).toBeLessThan(10_000);
    });
  });

  describe('objects', () => {
    it('returns object unchanged when within key limit', () => {
      const input = Object.fromEntries(Array(40).fill(null).map((_, i) => [`key${i}`, i]));
      expect(truncateToolOutputValue(input)).toEqual(input);
    });

    it('truncates object exceeding key limit', () => {
      const input = Object.fromEntries(Array(100).fill(null).map((_, i) => [`key${i}`, i]));
      const result = truncateToolOutputValue(input) as Record<string, unknown>;
      expect(Object.keys(result).length).toBeLessThan(100);
      expect(result.truncated).toBe(true);
    });

    it('truncates long string values in objects', () => {
      const input = { nested: 'a'.repeat(10_000) };
      const result = truncateToolOutputValue(input) as Record<string, unknown>;
      expect((result.nested as string).length).toBeLessThan(10_000);
    });

    it('truncates nested objects', () => {
      const inner = Object.fromEntries(Array(100).fill(null).map((_, i) => [`k${i}`, i]));
      const input = { outer: inner };
      const result = truncateToolOutputValue(input) as Record<string, unknown>;
      const outer = result.outer as Record<string, unknown>;
      expect(Object.keys(outer).length).toBeLessThan(100);
    });
  });

  describe('primitives', () => {
    it('returns numbers unchanged', () => expect(truncateToolOutputValue(42)).toBe(42));
    it('returns booleans unchanged', () => expect(truncateToolOutputValue(true)).toBe(true));
    it('returns null unchanged', () => expect(truncateToolOutputValue(null)).toBe(null));
    it('returns undefined unchanged', () => expect(truncateToolOutputValue(undefined)).toBe(undefined));
  });

  describe('mixed structures', () => {
    it('truncates deeply nested mixed structure', () => {
      const input = {
        arr: Array(30).fill({ str: 'a'.repeat(1000) }),
        nested: { arr: Array(30).fill('x') },
      };
      const result = truncateToolOutputValue(input) as Record<string, unknown>;
      const arr = result.arr as unknown[];
      expect(arr.length).toBeLessThan(30);
      const nested = result.nested as Record<string, unknown>;
      expect((nested.arr as unknown[]).length).toBeLessThan(30);
    });
  });
});

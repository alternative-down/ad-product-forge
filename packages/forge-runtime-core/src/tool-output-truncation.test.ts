import { describe, expect, it } from 'vitest';

import { truncateToolOutputValue } from './tool-output-truncation.js';

describe('truncateToolOutputValue', () => {
  it('returns strings under the limit unchanged', () => {
    const short = 'hello world';
    expect(truncateToolOutputValue(short)).toBe(short);
  });

  it('returns strings at the character limit unchanged', () => {
    const exactly = 'x'.repeat(8_000);
    expect(truncateToolOutputValue(exactly)).toBe(exactly);
  });

  it('truncates strings exceeding character limit', () => {
    const long = 'x'.repeat(8_500);
    const result = truncateToolOutputValue(long) as string;
    expect(result).toContain('[truncated tool output');
    expect(result.length).toBeLessThan(long.length);
  });

  it('truncates strings exceeding line limit', () => {
    const multiline = '\n'.repeat(150);
    const result = truncateToolOutputValue(multiline) as string;
    expect(result).toContain('[truncated tool output');
    // Splits produce MAX_TOOL_OUTPUT_LINES + 1 segments (MAX lines + truncation append)
    expect(result.split('\n').length).toBe(122);
  });

  it('returns arrays under the item limit unchanged', () => {
    expect(truncateToolOutputValue([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('returns arrays at the item limit unchanged', () => {
    const exact = Array.from({ length: 25 }, (_, i) => i);
    expect(truncateToolOutputValue(exact)).toEqual(exact);
  });

  it('truncates arrays exceeding item limit', () => {
    const big = Array.from({ length: 30 }, (_, i) => i);
    const result = truncateToolOutputValue(big) as unknown[];
    expect(result.length).toBe(26);
    const marker = result[25] as Record<string, unknown>;
    expect(marker).toMatchObject({
      truncated: true,
      reason: 'array-items',
      keptItems: 25,
      omittedItems: 5,
    });
  });

  it('returns arrays at MAX_TOOL_OUTPUT_ARRAY_ITEMS without truncating individual items', () => {
    const nested = [[1, 2, 3], [4, 5, 6, 7, 8]];
    const result = truncateToolOutputValue(nested) as unknown[];
    // Slice takes first 25 items; nested arrays are not recursively truncated here
    expect(result[1]).toEqual([4, 5, 6, 7, 8]);
  });

  it('returns objects under the key limit unchanged', () => {
    expect(truncateToolOutputValue({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('returns objects at the key limit unchanged', () => {
    const exact = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`key${i}`, i]),
    );
    expect(truncateToolOutputValue(exact)).toEqual(exact);
  });

  it('truncates objects exceeding key limit', () => {
    const big = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [`key${i}`, i]),
    );
    const result = truncateToolOutputValue(big) as Record<string, unknown>;
    // First 50 keys + 3 properties spread from marker (truncated, truncatedReason, keptKeys) + 1 marker = 54
    expect(Object.keys(result).length).toBe(54);
    expect(result).toMatchObject({
      truncated: true,
      truncatedReason: 'object-keys',
      keptKeys: 50,
      omittedKeys: 10,
    });
  });

  it('truncates nested values inside objects', () => {
    const nested = { text: 'x'.repeat(9_000) };
    const result = truncateToolOutputValue(nested) as Record<string, unknown>;
    const textValue = result.text as string;
    expect(textValue).toContain('[truncated tool output');
  });

  it('returns non-object/array/string values unchanged', () => {
    expect(truncateToolOutputValue(42)).toBe(42);
    expect(truncateToolOutputValue(true)).toBe(true);
    expect(truncateToolOutputValue(null)).toBe(null);
    expect(truncateToolOutputValue(undefined)).toBe(undefined);
  });

  it('does not mutate the original value', () => {
    const original = { text: 'hello world' };
    truncateToolOutputValue(original);
    expect(original).toEqual({ text: 'hello world' });
  });

  it('truncates arrays inside objects', () => {
    const complex = [{ items: Array.from({ length: 30 }, (_, i) => i) }];
    const result = truncateToolOutputValue(complex) as unknown[];
    const inner = (result[0] as Record<string, unknown>).items as unknown[];
    expect(inner.length).toBe(26);
  });

  it('deeply truncates values in object entries', () => {
    const deep = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`key${i}`, 'x'.repeat(9_000)]),
    );
    const result = truncateToolOutputValue(deep) as Record<string, unknown>;
    for (const value of Object.values(result)) {
      const str = value as string;
      expect(str.length).toBeLessThan(9_000);
      expect(str).toContain('[truncated tool output');
    }
  });
});

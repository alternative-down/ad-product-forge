import { describe, it, expect } from 'vitest';
import { countTokens, estimateTextUnits } from './token-counter.js';

describe('token-counter', () => {
  describe('countTokens', () => {
    it('returns 0 for empty string', () => {
      expect(countTokens('')).toBe(0);
    });

    it('returns 0 for null/undefined', () => {
      expect(countTokens(null as any)).toBe(0);
    });

    it('counts tokens for simple text', () => {
      const tokens = countTokens('hello world');
      expect(tokens).toBeGreaterThan(0);
    });

    it('counts more tokens for longer text', () => {
      const short = countTokens('hi');
      const long = countTokens('hello world this is a longer sentence');
      expect(long).toBeGreaterThan(short);
    });

    it('handles unicode characters', () => {
      const result = countTokens('こんにちは世界');
      expect(result).toBeGreaterThan(0);
    });

    it('handles special characters', () => {
      const result = countTokens('!@#$%^&*()_+-=[]{}|;:,.<>?');
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('estimateTextUnits', () => {
    it('returns at least 1 for any non-empty text', () => {
      expect(estimateTextUnits('a')).toBeGreaterThanOrEqual(1);
    });

    it('returns 1 for empty string (max with 0, then max with 1)', () => {
      // Math.max(1, 0) = 1, so empty returns 1
      expect(estimateTextUnits('')).toBeGreaterThanOrEqual(1);
    });

    it('scales with text length', () => {
      const short = estimateTextUnits('hi');
      const long = estimateTextUnits('this is a much longer piece of text for comparison');
      expect(long).toBeGreaterThan(short);
    });

    it('is at least countTokens result', () => {
      const text = 'hello world test';
      expect(estimateTextUnits(text)).toBeGreaterThanOrEqual(countTokens(text));
    });
  });
});

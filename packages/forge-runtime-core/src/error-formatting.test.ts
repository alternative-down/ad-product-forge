/**
 * error-formatting.test.ts
 *
 * Tests for `errorMsg` helper — canonical location moved to @forge-runtime/core
 * in #5889 (PR #5933, Day 22).
 *
 * Coverage: 100% of branches
 *   - Error instance → .message
 *   - string → passthrough
 *   - other → JSON.stringify
 *   - Edge cases: Error subclass, empty message, circular reference, undefined, null
 */

import { describe, it, expect } from 'vitest';
import { errorMsg } from './error-formatting';

describe('errorMsg', () => {
  describe('Error instance', () => {
    it('returns .message for a standard Error', () => {
      const err = new Error('boom');
      expect(errorMsg(err)).toBe('boom');
    });

    it('returns .message for a TypeError', () => {
      const err = new TypeError('bad type');
      expect(errorMsg(err)).toBe('bad type');
    });

    it('returns empty string for Error with empty message', () => {
      const err = new Error('');
      expect(errorMsg(err)).toBe('');
    });

    it('returns .message for Error subclass (RangeError)', () => {
      const err = new RangeError('out of range');
      expect(errorMsg(err)).toBe('out of range');
    });

    it('preserves message for Error subclass with custom name', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }
      const err = new CustomError('custom failure');
      expect(errorMsg(err)).toBe('custom failure');
    });
  });

  describe('string', () => {
    it('passes through non-empty string', () => {
      expect(errorMsg('something failed')).toBe('something failed');
    });

    it('passes through empty string', () => {
      expect(errorMsg('')).toBe('');
    });

    it('passes through string with special characters', () => {
      expect(errorMsg('error: "x" not found')).toBe('error: "x" not found');
    });
  });

  describe('other values (JSON.stringify fallback)', () => {
    it('stringifies numbers', () => {
      expect(errorMsg(42)).toBe('42');
    });

    it('stringifies booleans', () => {
      expect(errorMsg(false)).toBe('false');
      expect(errorMsg(true)).toBe('true');
    });

    it('stringifies null', () => {
      expect(errorMsg(null)).toBe('null');
    });

    it('stringifies undefined', () => {
      // JSON.stringify(undefined) returns undefined (not a string)
      // The helper returns JSON.stringify's output verbatim
      expect(errorMsg(undefined)).toBeUndefined();
    });

    it('stringifies plain objects', () => {
      expect(errorMsg({ code: 'E_FAIL', detail: 'oops' })).toBe(
        '{"code":"E_FAIL","detail":"oops"}'
      );
    });

    it('stringifies arrays', () => {
      expect(errorMsg([1, 2, 3])).toBe('[1,2,3]');
    });

    it('handles circular references via JSON.stringify throw', () => {
      // JSON.stringify throws TypeError on circular refs
      // errorMsg propagates the JSON.stringify throw (NOT caught)
      const obj: Record<string, unknown> = {};
      obj.self = obj;
      expect(() => errorMsg(obj)).toThrow(TypeError);
    });

    it('handles BigInt via JSON.stringify throw', () => {
      // JSON.stringify throws on BigInt (no implicit conversion)
      expect(() => errorMsg(BigInt(123))).toThrow(TypeError);
    });
  });
});
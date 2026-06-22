/**
 * tool-error-wrapper.test.ts
 *
 * Tests for `withToolErrorLogging` and `ToolResult<T>` discriminated union —
 * canonical location moved to @forge-runtime/core in #5889 (PR #5933, Day 22).
 *
 * Coverage:
 *   - Success path returns `{ valid: true, data }`
 *   - Failure path returns `{ valid: false, error, hint }` + forgeDebug called once
 *   - Error → errorMsg(message)
 *   - string throw → errorMsg(passthrough)
 *   - object throw → errorMsg(JSON.stringify)
 *   - forgeDebug format: scope, level='error', message=`${op} error`, context={ error }
 *   - ToolResult<T> discriminated union narrowing
 */

import { describe, it, expect, vi } from 'vitest';
import { forgeDebug } from './debug';
import { withToolErrorLogging, type ToolResult } from './tool-error-wrapper';

vi.mock('./debug', () => ({
  forgeDebug: vi.fn(),
}));

const mockedForgeDebug = vi.mocked(forgeDebug);

describe('withToolErrorLogging', () => {
  describe('success path', () => {
    it('returns { valid: true, data } when fn resolves', async () => {
      mockedForgeDebug.mockClear();
      const result = await withToolErrorLogging({
        scope: 'tools:test',
        op: 'doSomething',
        hint: 'Try again',
        fn: async () => ({ items: [1, 2, 3] }),
      });
      expect(result).toEqual({ valid: true, data: { items: [1, 2, 3] } });
      expect(mockedForgeDebug).not.toHaveBeenCalled();
    });

    it('preserves string return value', async () => {
      const result = await withToolErrorLogging({
        scope: 'tools:test',
        op: 'getName',
        hint: 'h',
        fn: async () => 'hello',
      });
      expect(result).toEqual({ valid: true, data: 'hello' });
    });

    it('preserves null return value', async () => {
      const result = await withToolErrorLogging({
        scope: 'tools:test',
        op: 'getNothing',
        hint: 'h',
        fn: async () => null,
      });
      expect(result).toEqual({ valid: true, data: null });
    });

    it('preserves array return value', async () => {
      const result = await withToolErrorLogging({
        scope: 'tools:test',
        op: 'listItems',
        hint: 'h',
        fn: async () => ['a', 'b', 'c'],
      });
      expect(result).toEqual({ valid: true, data: ['a', 'b', 'c'] });
    });
  });

  describe('failure path', () => {
    it('returns { valid: false, error, hint } when fn throws Error', async () => {
      mockedForgeDebug.mockClear();
      const result = await withToolErrorLogging({
        scope: 'tools:test',
        op: 'failingOp',
        hint: 'Please retry',
        fn: async () => {
          throw new Error('network timeout');
        },
      });
      expect(result).toEqual({
        valid: false,
        error: 'network timeout',
        hint: 'Please retry',
      });
    });

    it('returns error from string throw via errorMsg passthrough', async () => {
      mockedForgeDebug.mockClear();
      const result = await withToolErrorLogging({
        scope: 'tools:test',
        op: 'stringThrow',
        hint: 'h',
        fn: async () => {
          throw 'string error';
        },
      });
      expect(result).toEqual({
        valid: false,
        error: 'string error',
        hint: 'h',
      });
    });

    it('returns error from object throw via JSON.stringify', async () => {
      mockedForgeDebug.mockClear();
      const result = await withToolErrorLogging({
        scope: 'tools:test',
        op: 'objectThrow',
        hint: 'h',
        fn: async () => {
          throw { code: 'E_FAIL', detail: 'oops' };
        },
      });
      expect(result).toEqual({
        valid: false,
        error: '{"code":"E_FAIL","detail":"oops"}',
        hint: 'h',
      });
    });
  });

  describe('forgeDebug invocation', () => {
    it('calls forgeDebug exactly once on failure with canonical format', async () => {
      mockedForgeDebug.mockClear();
      await withToolErrorLogging({
        scope: 'tools:capabilities',
        op: 'list_agent_roles',
        hint: 'Try again',
        fn: async () => {
          throw new Error('db unavailable');
        },
      });
      expect(mockedForgeDebug).toHaveBeenCalledTimes(1);
      expect(mockedForgeDebug).toHaveBeenCalledWith({
        scope: 'tools:capabilities',
        level: 'error',
        message: 'list_agent_roles error',
        context: { error: 'db unavailable' },
      });
    });

    it('uses errorMsg for non-Error throws in forgeDebug context', async () => {
      mockedForgeDebug.mockClear();
      await withToolErrorLogging({
        scope: 'tools:test',
        op: 'weirdThrow',
        hint: 'h',
        fn: async () => {
          throw 42;
        },
      });
      expect(mockedForgeDebug).toHaveBeenCalledWith({
        scope: 'tools:test',
        level: 'error',
        message: 'weirdThrow error',
        context: { error: '42' },
      });
    });

    it('does not call forgeDebug on success', async () => {
      mockedForgeDebug.mockClear();
      await withToolErrorLogging({
        scope: 'tools:test',
        op: 'successOp',
        hint: 'h',
        fn: async () => 'ok',
      });
      expect(mockedForgeDebug).not.toHaveBeenCalled();
    });
  });

  describe('ToolResult<T> discriminated union typing', () => {
    it('narrowing: valid=true → access data', async () => {
      const result: ToolResult<{ count: number }> = await withToolErrorLogging({
        scope: 'tools:test',
        op: 'getCount',
        hint: 'h',
        fn: async () => ({ count: 5 }),
      });
      if (result.valid) {
        // TypeScript narrows result to { valid: true; data: { count: number } }
        expect(result.data.count).toBe(5);
      } else {
        throw new Error('Expected valid=true');
      }
    });

    it('narrowing: valid=false → access error/hint', async () => {
      const result: ToolResult<unknown> = await withToolErrorLogging({
        scope: 'tools:test',
        op: 'alwaysFails',
        hint: 'recovery hint here',
        fn: async () => {
          throw new Error('intentional');
        },
      });
      if (!result.valid) {
        expect(result.error).toBe('intentional');
        expect(result.hint).toBe('recovery hint here');
        // data should not be accessible here (TypeScript compile-time check)
      } else {
        throw new Error('Expected valid=false');
      }
    });
  });
});
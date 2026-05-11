/**
 * Unit tests for agent-runner-error-formatting.ts.
 *
 * Groups:
 *   serializeUnknown — recursive object/value serialization
 *   serializeError — Error → structured Record
 *   formatAbsentErrorDetailValue — unknown → string|null
 *   extractAbsentErrorDetails — Error → detail lines
 *   formatAbsentExecutionError — full absent-execution message
 */
import { describe, expect, it, vi } from 'vitest';
import {
  serializeUnknown,
  serializeError,
  formatAbsentErrorDetailValue,
  extractAbsentErrorDetails,
  formatAbsentExecutionError,
} from './agent-runner-error-formatting';

// ─── serializeUnknown ─────────────────────────────────────────────────────────

describe('serializeUnknown', () => {
  it('returns primitives as-is', () => {
    expect(serializeUnknown(null)).toBeNull();
    expect(serializeUnknown(undefined)).toBeUndefined();
    expect(serializeUnknown(42)).toBe(42);
    expect(serializeUnknown('hello')).toBe('hello');
    expect(serializeUnknown(true)).toBe(true);
  });

  it('recursively serializes nested objects', () => {
    const result = serializeUnknown({ a: { b: 1 }, c: 'text' });
    expect(result).toEqual({ a: { b: 1 }, c: 'text' });
  });

  it('recursively serializes arrays', () => {
    const result = serializeUnknown([{ x: 1 }, { x: 2 }]);
    expect(result).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it('recursively serializes Error as object', () => {
    const error = new Error('boom');
    const result = serializeUnknown(error) as Record<string, unknown>;
    expect(result.name).toBe('Error');
    expect(result.message).toBe('boom');
    expect(result.stack).toBeDefined();
  });

  it('recursively serializes deeply nested errors', () => {
    const inner = new Error('inner error');
    const outer = new Error('outer error');
    (outer as unknown as Record<string, unknown>).cause = inner;
    const result = serializeUnknown(outer) as Record<string, unknown>;
    const cause = result.cause as Record<string, unknown>;
    expect(cause.name).toBe('Error');
    expect(cause.message).toBe('inner error');
  });
});

// ─── serializeError ───────────────────────────────────────────────────────────

describe('serializeError', () => {
  it('serializes a plain Error', () => {
    const error = new Error('something went wrong');
    const result = serializeError(error);
    expect(result).toMatchObject({
      name: 'Error',
      message: 'something went wrong',
    });
    expect(result.stack).toBeDefined();
  });

  it('serializes a typed Error subclass', () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }
    const error = new CustomError('typed error');
    const result = serializeError(error) as Record<string, unknown>;
    expect(result.name).toBe('CustomError');
    expect(result.message).toBe('typed error');
    expect(result.stack).toBeDefined();
  });

  it('includes name, message, stack as base fields', () => {
    const error = new Error('test');
    const result = serializeError(error) as Record<string, unknown>;
    expect(Object.keys(result)).toContain('name');
    expect(Object.keys(result)).toContain('message');
    expect(Object.keys(result)).toContain('stack');
  });

  it('returns type/value for non-Error values', () => {
    expect(serializeError(42)).toEqual({ type: 'number', value: 42 });
    expect(serializeError('hello')).toEqual({ type: 'string', value: 'hello' });
    expect(serializeError(null)).toEqual({ type: 'object', value: null });
  });

  it('includes extra properties beyond name/message/stack', () => {
    const error = new Error('annotated');
    (error as unknown as Record<string, unknown>).statusCode = 500;
    (error as unknown as Record<string, unknown>).url = 'https://example.com';
    const result = serializeError(error) as Record<string, unknown>;
    expect(result.statusCode).toBe(500);
    expect(result.url).toBe('https://example.com');
  });
});

// ─── formatAbsentErrorDetailValue ────────────────────────────────────────────

describe('formatAbsentErrorDetailValue', () => {
  it('returns null for null/undefined', () => {
    expect(formatAbsentErrorDetailValue(null)).toBeNull();
    expect(formatAbsentErrorDetailValue(undefined)).toBeNull();
  });

  it('returns short strings as-is', () => {
    expect(formatAbsentErrorDetailValue('short')).toBe('short');
  });

  it('truncates long strings to 200 characters', () => {
    const long = 'a'.repeat(300);
    const result = formatAbsentErrorDetailValue(long);
    expect(result).toBe(`${'a'.repeat(200)}...`);
    expect(result!.length).toBe(203);
  });

  it('returns string representations for numbers and booleans', () => {
    expect(formatAbsentErrorDetailValue(0)).toBe('0');
    expect(formatAbsentErrorDetailValue(404)).toBe('404');
    expect(formatAbsentErrorDetailValue(true)).toBe('true');
    expect(formatAbsentErrorDetailValue(false)).toBe('false');
  });

  it('JSON-stringifies objects', () => {
    const result = formatAbsentErrorDetailValue({ key: 'value' });
    expect(result).toBe('{"key":"value"}');
  });

  it('JSON-stringifies arrays', () => {
    const result = formatAbsentErrorDetailValue([1, 2, 3]);
    expect(result).toBe('[1,2,3]');
  });
});

// ─── extractAbsentErrorDetails ────────────────────────────────────────────────

describe('extractAbsentErrorDetails', () => {
  it('returns empty array for plain Error', () => {
    const error = new Error('plain');
    expect(extractAbsentErrorDetails(error)).toEqual([]);
  });

  it('extracts code', () => {
    const error = new Error('err') as Error & { code: string };
    error.code = 'ENOTFOUND';
    expect(extractAbsentErrorDetails(error)).toContain('Error code: ENOTFOUND');
  });

  it('extracts statusCode', () => {
    const error = new Error('err') as Error & { statusCode: number };
    error.statusCode = 404;
    expect(extractAbsentErrorDetails(error)).toContain('statusCode: 404');
  });

  it('extracts statusText', () => {
    const error = new Error('err') as Error & { statusText: string };
    error.statusText = 'Not Found';
    expect(extractAbsentErrorDetails(error)).toContain('statusText: Not Found');
  });

  it('extracts url', () => {
    const error = new Error('err') as Error & { url: string };
    error.url = 'https://api.example.com/endpoint';
    expect(extractAbsentErrorDetails(error)).toContain('url: https://api.example.com/endpoint');
  });

  it('extracts responseBody (short)', () => {
    const error = new Error('err') as Error & { responseBody: string };
    error.responseBody = 'Internal Server Error';
    expect(extractAbsentErrorDetails(error)).toContain('responseBody: Internal Server Error');
  });

  it('extracts responseBody (truncated)', () => {
    const error = new Error('err') as Error & { responseBody: string };
    error.responseBody = 'x'.repeat(300);
    const details = extractAbsentErrorDetails(error);
    const responseBodyLine = details.find((l) => l.startsWith('responseBody:'));
    expect(responseBodyLine).toBe(`responseBody: ${'x'.repeat(200)}...`);
  });

  it('extracts body', () => {
    const error = new Error('err') as Error & { body: string };
    error.body = '{"error":"bad_request"}';
    expect(extractAbsentErrorDetails(error)).toContain('body: {"error":"bad_request"}');
  });

  it('extracts data', () => {
    const error = new Error('err') as Error & { data: unknown };
    error.data = { id: 123 };
    expect(extractAbsentErrorDetails(error)).toContain('data: {"id":123}');
  });

  it('extracts detail', () => {
    const error = new Error('err') as Error & { detail: string };
    error.detail = 'Rate limit exceeded';
    expect(extractAbsentErrorDetails(error)).toContain('Detail: Rate limit exceeded');
  });

  it('ignores non-string code', () => {
    const error = new Error('err') as Error & { code: unknown };
    error.code = 123;
    expect(extractAbsentErrorDetails(error)).not.toContain('Error code:');
  });

  it('ignores non-number statusCode', () => {
    const error = new Error('err') as Error & { statusCode: unknown };
    error.statusCode = '500';
    expect(extractAbsentErrorDetails(error)).not.toContain('statusCode:');
  });

  it('extracts multiple fields together', () => {
    const error = new Error('composite') as Error & Record<string, unknown>;
    error.code = 'ERR_COMPOSITE';
    error.statusCode = 502;
    error.statusText = 'Bad Gateway';
    const details = extractAbsentErrorDetails(error);
    expect(details).toContain('Error code: ERR_COMPOSITE');
    expect(details).toContain('statusCode: 502');
    expect(details).toContain('statusText: Bad Gateway');
  });
});

// ─── formatAbsentExecutionError ───────────────────────────────────────────────

describe('formatAbsentExecutionError', () => {
  it('formats a plain Error without progress', () => {
    const error = new Error('step failed');
    const result = formatAbsentExecutionError({ stage: 'agent-generate', error });
    expect(result).toContain('Stage: agent-generate');
    expect(result).toContain('Error: step failed');
  });

  it('formats a non-Error value', () => {
    const result = formatAbsentExecutionError({
      stage: 'loading-runnable-contract',
      error: 'Contract not found',
    });
    expect(result).toContain('Stage: loading-runnable-contract');
    expect(result).toContain('Contract not found');
  });

  it('includes progress lines when present', () => {
    const error = new Error('boom');
    const result = formatAbsentExecutionError({
      stage: 'step-started',
      lastGenerateProgress: {
        stage: 'building-prompt',
        at: 1_234_567_890,
        detail: null,
      },
      error,
    });
    expect(result).toContain('Last progress stage: building-prompt');
    expect(result).toContain('Last progress at:');
  });

  it('includes progress detail when present', () => {
    const error = new Error('boom');
    const result = formatAbsentExecutionError({
      stage: 'agent-generate',
      lastGenerateProgress: {
        stage: 'finalizing-run',
        at: Date.now(),
        detail: { tokensGenerated: 512 },
      },
      error,
    });
    expect(result).toContain('Last progress detail: {"tokensGenerated":512}');
  });

  it('includes extracted error details for Error instances', () => {
    const error = new Error('boom') as Error & { statusCode: number };
    error.statusCode = 500;
    const result = formatAbsentExecutionError({ stage: 'agent-generate', error });
    expect(result).toContain('statusCode: 500');
  });

  it('defaults stage to "unknown" when null', () => {
    const error = new Error('boom');
    const result = formatAbsentExecutionError({ stage: null, error });
    expect(result).toContain('Stage: unknown');
  });

  it('uses custom extractAbsentErrorDetails when provided', () => {
    const error = new Error('boom');
    const customExtract = vi.fn().mockReturnValue(['Custom detail: custom info']);
    const result = formatAbsentExecutionError({ stage: 'agent-generate', error }, customExtract);
    expect(customExtract).toHaveBeenCalledWith(error);
    expect(result).toContain('Custom detail: custom info');
  });
});
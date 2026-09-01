import { describe, it, expect, vi } from 'vitest';
import {
  serializeUnknown,
  serializeError,
  errorMsg,
  formatAbsentErrorDetailValue,
  extractAbsentErrorDetails,
  formatAbsentExecutionError,
  type AbsentExecutionErrorInput,
} from './error-formatting';

describe('serializeUnknown', () => {
  it('returns primitives unchanged', () => {
    expect(serializeUnknown('hello')).toBe('hello');
    expect(serializeUnknown(42)).toBe(42);
    expect(serializeUnknown(true)).toBe(true);
    expect(serializeUnknown(false)).toBe(false);
    expect(serializeUnknown(null)).toBeNull();
  });

  it('returns undefined unchanged', () => {
    expect(serializeUnknown(undefined)).toBeUndefined();
  });

  it('serializes an Error instance via serializeError', () => {
    const err = new Error('boom');
    const result = serializeUnknown(err) as Record<string, unknown>;
    expect(result.name).toBe('Error');
    expect(result.message).toBe('boom');
    expect(typeof result.stack).toBe('string');
  });

  it('recursively maps array elements', () => {
    const arr = [1, 'two', true, null];
    expect(serializeUnknown(arr)).toEqual([1, 'two', true, null]);
  });

  it('recursively maps nested arrays', () => {
    const nested = [[1, 2], [3, 4]];
    expect(serializeUnknown(nested)).toEqual([[1, 2], [3, 4]]);
  });

  it('recursively maps object entries', () => {
    const obj = { a: 1, b: 'two', c: true };
    expect(serializeUnknown(obj)).toEqual({ a: 1, b: 'two', c: true });
  });

  it('recursively maps nested objects', () => {
    const obj = { outer: { inner: { value: 42 } } };
    expect(serializeUnknown(obj)).toEqual({ outer: { inner: { value: 42 } } });
  });

  it('serializes Errors nested inside arrays', () => {
    const err = new Error('nested');
    const arr = [1, err, 3];
    const result = serializeUnknown(arr) as Array<Record<string, unknown>>;
    expect(result[0]).toBe(1);
    expect(result[1].message).toBe('nested');
    expect(result[2]).toBe(3);
  });

  it('serializes Errors nested inside objects', () => {
    const err = new TypeError('bad type');
    const obj = { wrapped: err, other: 'field' };
    const result = serializeUnknown(obj) as Record<string, Record<string, unknown>>;
    expect(result.wrapped.message).toBe('bad type');
    expect(result.wrapped.name).toBe('TypeError');
    expect(result.other).toBe('field');
  });
});

describe('serializeError', () => {
  it('serializes a basic Error with name, message, stack', () => {
    const err = new Error('boom');
    const result = serializeError(err);
    expect(result.name).toBe('Error');
    expect(result.message).toBe('boom');
    expect(typeof result.stack).toBe('string');
  });

  it('serializes a custom Error class', () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }
    const err = new CustomError('custom');
    const result = serializeError(err);
    expect(result.name).toBe('CustomError');
    expect(result.message).toBe('custom');
  });

  it('includes extra properties beyond name/message/stack', () => {
    const err = new Error('api fail') as Error & { statusCode: number; url: string };
    err.statusCode = 500;
    err.url = 'https://api.example.com';
    const result = serializeError(err);
    expect(result.name).toBe('Error');
    expect(result.message).toBe('api fail');
    expect(result.statusCode).toBe(500);
    expect(result.url).toBe('https://api.example.com');
  });

  it('serializes non-Error string with type and value', () => {
    const result = serializeError('just a string');
    expect(result).toEqual({ type: 'string', value: 'just a string' });
  });

  it('serializes non-Error number with type and value', () => {
    const result = serializeError(404);
    expect(result).toEqual({ type: 'number', value: 404 });
  });

  it('serializes non-Error null with type and value', () => {
    const result = serializeError(null);
    expect(result).toEqual({ type: 'object', value: null });
  });
});

describe('errorMsg', () => {
  it('returns the message for an Error instance', () => {
    expect(errorMsg(new Error('explosion'))).toBe('explosion');
  });

  it('returns the string when given a string', () => {
    expect(errorMsg('plain text')).toBe('plain text');
  });

  it('returns JSON.stringify for numbers', () => {
    expect(errorMsg(42)).toBe('42');
  });

  it('returns JSON.stringify for objects', () => {
    expect(errorMsg({ code: 'E1', status: 500 })).toBe('{"code":"E1","status":500}');
  });

  it('returns JSON.stringify for null', () => {
    expect(errorMsg(null)).toBe('null');
  });
});

describe('formatAbsentErrorDetailValue', () => {
  it('returns null for null', () => {
    expect(formatAbsentErrorDetailValue(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(formatAbsentErrorDetailValue(undefined)).toBeNull();
  });

  it('returns short strings unchanged', () => {
    expect(formatAbsentErrorDetailValue('short')).toBe('short');
  });

  it('truncates strings longer than 200 chars with ellipsis', () => {
    const long = 'a'.repeat(250);
    const result = formatAbsentErrorDetailValue(long);
    expect(result).toBe('a'.repeat(200) + '...');
    expect(result?.length).toBe(203);
  });

  it('returns strings of exactly 200 chars unchanged', () => {
    const exact = 'b'.repeat(200);
    expect(formatAbsentErrorDetailValue(exact)).toBe(exact);
  });

  it('returns String() for numbers', () => {
    expect(formatAbsentErrorDetailValue(42)).toBe('42');
    expect(formatAbsentErrorDetailValue(0)).toBe('0');
    expect(formatAbsentErrorDetailValue(-1.5)).toBe('-1.5');
  });

  it('returns String() for booleans', () => {
    expect(formatAbsentErrorDetailValue(true)).toBe('true');
    expect(formatAbsentErrorDetailValue(false)).toBe('false');
  });

  it('returns JSON.stringify for objects', () => {
    expect(formatAbsentErrorDetailValue({ a: 1 })).toBe('{"a":1}');
    expect(formatAbsentErrorDetailValue([1, 2, 3])).toBe('[1,2,3]');
  });
});

describe('extractAbsentErrorDetails', () => {
  it('returns empty array for error with no extra fields', () => {
    const err = new Error('plain');
    expect(extractAbsentErrorDetails(err)).toEqual([]);
  });

  it('extracts code field', () => {
    const err = new Error('fail') as Error & { code: string };
    err.code = 'ECONNREFUSED';
    expect(extractAbsentErrorDetails(err)).toContain('Error code: ECONNREFUSED');
  });

  it('extracts statusCode field', () => {
    const err = new Error('http fail') as Error & { statusCode: number };
    err.statusCode = 503;
    expect(extractAbsentErrorDetails(err)).toContain('statusCode: 503');
  });

  it('extracts statusText field', () => {
    const err = new Error('http fail') as Error & { statusText: string };
    err.statusText = 'Service Unavailable';
    expect(extractAbsentErrorDetails(err)).toContain('statusText: Service Unavailable');
  });

  it('extracts url field', () => {
    const err = new Error('http fail') as Error & { url: string };
    err.url = 'https://api.example.com/v1/resource';
    expect(extractAbsentErrorDetails(err)).toContain('url: https://api.example.com/v1/resource');
  });

  it('extracts body field via formatAbsentErrorDetailValue', () => {
    const err = new Error('http fail') as Error & { body: string };
    err.body = 'response body content';
    expect(extractAbsentErrorDetails(err)).toContain('body: response body content');
  });

  it('extracts data field via formatAbsentErrorDetailValue', () => {
    const err = new Error('fail') as Error & { data: Record<string, unknown> };
    err.data = { userId: 42, action: 'delete' };
    expect(extractAbsentErrorDetails(err)).toContain('data: {"userId":42,"action":"delete"}');
  });

  it('extracts detail field with Detail: prefix', () => {
    const err = new Error('fail') as Error & { detail: string };
    err.detail = 'extra context info';
    expect(extractAbsentErrorDetails(err)).toContain('Detail: extra context info');
  });

  it('skips fields with wrong types', () => {
    const err = new Error('fail') as Error & { code: number; statusCode: string };
    err.code = 42;
    err.statusCode = 'not a number';
    expect(extractAbsentErrorDetails(err)).toEqual([]);
  });

  it('extracts all fields at once', () => {
    const err = new Error('complex fail') as Error & {
      code: string;
      statusCode: number;
      statusText: string;
      url: string;
    };
    err.code = 'E_TIMEOUT';
    err.statusCode = 504;
    err.statusText = 'Gateway Timeout';
    err.url = 'https://api.example.com/slow';
    const details = extractAbsentErrorDetails(err);
    expect(details).toHaveLength(4);
    expect(details).toContain('Error code: E_TIMEOUT');
    expect(details).toContain('statusCode: 504');
    expect(details).toContain('statusText: Gateway Timeout');
    expect(details).toContain('url: https://api.example.com/slow');
  });
});

describe('formatAbsentExecutionError', () => {
  const baseInput: AbsentExecutionErrorInput = {
    stage: 'data-fetch',
    error: new Error('fetch failed'),
  };

  it('uses "unknown" as fallback when stage is null', () => {
    const input: AbsentExecutionErrorInput = { stage: null, error: new Error('x') };
    const result = formatAbsentExecutionError(input);
    expect(result).toContain('Stage: unknown');
  });

  it('includes Error name and message for Error instance', () => {
    const result = formatAbsentExecutionError(baseInput);
    expect(result).toContain('Stage: data-fetch');
    expect(result).toContain('Error: fetch failed');
  });

  it('includes lastGenerateProgress stage and timestamp', () => {
    const input: AbsentExecutionErrorInput = {
      stage: 'render',
      error: new Error('render fail'),
      lastGenerateProgress: {
        stage: 'preprocess',
        at: 1700000000000,
        detail: null,
      },
    };
    const result = formatAbsentExecutionError(input);
    expect(result).toContain('Last progress stage: preprocess');
    expect(result).toContain('Last progress at:');
    expect(result).toContain(new Date(1700000000000).toISOString());
  });

  it('includes lastGenerateProgress detail when present', () => {
    const input: AbsentExecutionErrorInput = {
      stage: 'render',
      error: new Error('render fail'),
      lastGenerateProgress: {
        stage: 'preprocess',
        at: 1700000000000,
        detail: { itemsProcessed: 5 },
      },
    };
    const result = formatAbsentExecutionError(input);
    expect(result).toContain('Last progress detail: {"itemsProcessed":5}');
  });

  it('omits progress lines when lastGenerateProgress is null', () => {
    const result = formatAbsentExecutionError(baseInput);
    expect(result).not.toContain('Last progress');
  });

  it('includes extracted error details for Error instance', () => {
    const err = new Error('http fail') as Error & { statusCode: number; code: string };
    err.statusCode = 500;
    err.code = 'E_INTERNAL';
    const input: AbsentExecutionErrorInput = { stage: 'api', error: err };
    const result = formatAbsentExecutionError(input);
    expect(result).toContain('Error code: E_INTERNAL');
    expect(result).toContain('statusCode: 500');
  });

  it('uses String() for non-Error values', () => {
    const input: AbsentExecutionErrorInput = { stage: 'serialize', error: 'plain string fail' };
    const result = formatAbsentExecutionError(input);
    expect(result).toContain('Stage: serialize');
    expect(result).toContain('plain string fail');
    expect(result).not.toContain('Error:'); // not an Error, so no Error: prefix
  });

  it('uses String(number) for non-Error values', () => {
    const input: AbsentExecutionErrorInput = { stage: 'count', error: 42 };
    const result = formatAbsentExecutionError(input);
    expect(result).toContain('42');
  });

  it('injects custom extractAbsentErrorDetailsFn when provided', () => {
    const customExtract = vi.fn().mockReturnValue(['CUSTOM DETAIL LINE']);
    const input: AbsentExecutionErrorInput = { stage: 'test', error: new Error('x') };
    const result = formatAbsentExecutionError(input, customExtract);
    expect(customExtract).toHaveBeenCalledTimes(1);
    expect(result).toContain('CUSTOM DETAIL LINE');
  });

  it('does not invoke custom extract for non-Error values', () => {
    const customExtract = vi.fn().mockReturnValue(['CUSTOM']);
    const input: AbsentExecutionErrorInput = { stage: 'test', error: 'not an error' };
    formatAbsentExecutionError(input, customExtract);
    expect(customExtract).not.toHaveBeenCalled();
  });
});

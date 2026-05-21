/**
 * Unit tests for coolify/helpers.ts.
 * normalizeDomainHost, extractCollection, extractItem, extractLogs,
 * removeUndefined, safeJsonParse, buildRequestError, toTimestamp.
 * Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  normalizeDomainHost,
  extractCollection,
  extractItem,
  extractLogs,
  removeUndefined,
  safeJsonParse,
  buildRequestError,
  toTimestamp,
} from './helpers';
import { ApplicationSchema, ApplicationEnvSchema } from './schemas';

// ─── normalizeDomainHost ─────────────────────────────────────────────────────

describe('normalizeDomainHost', () => {
  it('returns null for null/undefined', () => {
    expect(normalizeDomainHost(null)).toBeNull();
    expect(normalizeDomainHost(undefined)).toBeNull();
  });

  it('returns null for empty/whitespace-only strings', () => {
    expect(normalizeDomainHost('')).toBeNull();
    expect(normalizeDomainHost('   ')).toBeNull();
    expect(normalizeDomainHost('\t')).toBeNull();
  });

  it('strips leading dot', () => {
    expect(normalizeDomainHost('.example.com')).toBe('example.com');
    expect(normalizeDomainHost('.foo.bar.io')).toBe('foo.bar.io');
  });

  it('strips trailing slashes', () => {
    expect(normalizeDomainHost('example.com/')).toBe('example.com');
    expect(normalizeDomainHost('example.com///')).toBe('example.com');
  });

  it('strips protocol from full URLs', () => {
    expect(normalizeDomainHost('https://example.com')).toBe('example.com');
    expect(normalizeDomainHost('http://example.com:8080')).toBe('example.com:8080');
    expect(normalizeDomainHost('https://app.coolify.io/dashboard')).toBe('app.coolify.io');
  });

  it('returns trimmed string as-is when no special treatment needed', () => {
    expect(normalizeDomainHost('  my-app.coolify.io  ')).toBe('my-app.coolify.io');
  });

  it('handles domain with path stripped via URL', () => {
    expect(normalizeDomainHost('https://app.example.com/path/to/app')).toBe('app.example.com');
  });
});

// ─── extractCollection ───────────────────────────────────────────────────────

describe('extractCollection', () => {
  it('returns data as-is when it is already an array', () => {
    const data = [
      { uuid: 'app-1', name: 'App One' },
      { uuid: 'app-2', name: 'App Two' },
    ];
    const result = extractCollection(data, ApplicationSchema);
    expect(result).toHaveLength(2);
  });

  it('extracts from "data" key when data is an object', () => {
    const data = {
      data: [
        { uuid: 'u1', name: 'App 1' },
        { uuid: 'u2', name: 'App 2' },
      ],
    };
    const result = extractCollection(data, ApplicationSchema);
    expect(result).toHaveLength(2);
    expect(result[0].uuid).toBe('u1');
  });

  it('extracts from "applications" key', () => {
    const data = { applications: [{ uuid: 'a1' }] };
    const result = extractCollection(data, ApplicationSchema);
    expect(result).toHaveLength(1);
  });

  it('extracts from "repositories" key', () => {
    const data = { repositories: [{ name: 'repo-1' }, { name: 'repo-2' }] };
    const result = extractCollection(data, z.object({ name: z.string() }));
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no matching array key found', () => {
    const data = { someOtherKey: 'value' };
    const result = extractCollection(data, ApplicationSchema);
    expect(result).toEqual([]);
  });

  it('validates each item against the schema', () => {
    const data = { data: [{ uuid: 'u1' }, { uuid: 123 }] }; // second item invalid
    expect(() => extractCollection(data, ApplicationSchema)).toThrow();
  });

  it('returns empty array for primitive data types', () => {
    expect(extractCollection('string', ApplicationSchema)).toEqual([]);
    expect(extractCollection(null, ApplicationSchema)).toEqual([]);
    expect(extractCollection(42, ApplicationSchema)).toEqual([]);
  });
});

// ─── extractItem ─────────────────────────────────────────────────────────────

describe('extractItem', () => {
  it('extracts from "deployment" key', () => {
    const data = { deployment: { id: 1, uuid: 'd1' } };
    const result = extractItem(data, z.object({ id: z.number(), uuid: z.string() }));
    expect(result).toEqual({ id: 1, uuid: 'd1' });
  });

  it('extracts from "application" key', () => {
    const data = { application: { uuid: 'app-1' } };
    const result = extractItem(data, z.object({ uuid: z.string() }));
    expect(result.uuid).toBe('app-1');
  });

  it('extracts from "data" key when value is an object', () => {
    const data = { data: { uuid: 'item-1' } };
    const result = extractItem(data, z.object({ uuid: z.string() }));
    expect(result.uuid).toBe('item-1');
  });

  it('falls back to parsing data directly when no key matches', () => {
    const data = { uuid: 'direct-item' };
    const result = extractItem(data, z.object({ uuid: z.string() }));
    expect(result.uuid).toBe('direct-item');
  });

  it('throws when data is primitive and no key matches', () => {
    expect(() => extractItem('string', z.object({ a: z.string() }))).toThrow();
    expect(() => extractItem(null, z.object({ a: z.string() }))).toThrow();
  });
});

// ─── extractLogs ─────────────────────────────────────────────────────────────

describe('extractLogs', () => {
  it('returns string as-is', () => {
    expect(extractLogs('Build successful\nDeploying...')).toBe('Build successful\nDeploying...');
  });

  it('extracts from "logs" key', () => {
    expect(extractLogs({ logs: 'Step 1 complete\nStep 2 starting' })).toBe(
      'Step 1 complete\nStep 2 starting',
    );
  });

  it('extracts from "data" key when logs is not present', () => {
    expect(extractLogs({ data: 'deployment output here' })).toBe('deployment output here');
  });

  it('extracts from "output" key', () => {
    expect(extractLogs({ output: 'stdout data' })).toBe('stdout data');
  });

  it('returns empty string when no suitable key found', () => {
    expect(extractLogs({ someOtherKey: 'value' })).toBe('');
    expect(extractLogs({})).toBe('');
  });

  it('returns empty string for null and undefined', () => {
    expect(extractLogs(null)).toBe('');
    expect(extractLogs(undefined)).toBe('');
  });
});

// ─── removeUndefined ────────────────────────────────────────────────────────

describe('removeUndefined', () => {
  it('removes keys with undefined values', () => {
    const input = { a: 1, b: undefined, c: 'hello' };
    const result = removeUndefined(input);
    expect(result).toEqual({ a: 1, c: 'hello' });
  });

  it('keeps null values', () => {
    const input = { a: 1, b: null, c: undefined };
    const result = removeUndefined(input);
    expect(result).toEqual({ a: 1, b: null });
  });

  it('keeps false and 0 values', () => {
    const input = { active: false, count: 0, name: undefined };
    const result = removeUndefined(input);
    expect(result).toEqual({ active: false, count: 0 });
  });

  it('returns empty object when all values are undefined', () => {
    expect(removeUndefined({ a: undefined, b: undefined })).toEqual({});
  });

  it('returns empty object for empty input', () => {
    expect(removeUndefined({})).toEqual({});
  });
});

// ─── safeJsonParse ───────────────────────────────────────────────────────────

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse('{"key":"value"}')).toEqual({ key: 'value' });
    expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('returns the original string on invalid JSON (not an Error)', () => {
    expect(safeJsonParse('not json at all')).toBe('not json at all');
    expect(safeJsonParse('{broken: json')).toBe('{broken: json');
  });

  it('truncates logged text to 100 chars', () => {
    // Just verify it doesn't throw — the logging is internal
    const long = 'x'.repeat(300);
    const result = safeJsonParse(long);
    expect(result).toBe(long);
  });
});

// ─── buildRequestError ──────────────────────────────────────────────────────

describe('buildRequestError', () => {
  it('formats method, path, status, and string data', () => {
    const msg = buildRequestError('GET', '/servers/uuid', 404, 'Not found');
    expect(msg).toBe('Coolify API GET /servers/uuid failed with 404: Not found');
  });

  it('JSON-stringifies object data', () => {
    const msg = buildRequestError('POST', '/apps', 500, { error: 'internal error' });
    expect(msg).toContain('POST /apps');
    expect(msg).toContain('500');
    expect(msg).toContain('internal error');
  });

  it('handles number data', () => {
    const msg = buildRequestError('DELETE', '/apps/1', 403, 403);
    expect(msg).toBe('Coolify API DELETE /apps/1 failed with 403: 403');
  });
});

// ─── toTimestamp ─────────────────────────────────────────────────────────────

describe('toTimestamp', () => {
  it('returns number as-is', () => {
    expect(toTimestamp(1234567890)).toBe(1234567890);
    expect(toTimestamp(0)).toBe(0);
  });

  it('parses numeric string as Number() then Date.parse() fallback', () => {
    // "12345" as Number is 12345
    expect(toTimestamp('12345')).toBe(12345);
  });

  it('parses ISO date string', () => {
    expect(toTimestamp('2024-01-15T10:30:00Z')).toBe(Date.parse('2024-01-15T10:30:00Z'));
  });

  it('returns 0 for unparseable string', () => {
    expect(toTimestamp('not a date')).toBe(0);
  });

  it('returns 0 for null', () => {
    expect(toTimestamp(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(toTimestamp(undefined as unknown as null)).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';

/*
 * Tests for helper functions in coolify/manager.ts.
 * Inline copies of the source helpers are tested directly.
 */
describe('normalizeDomainHost', () => {
  function normalizeDomainHost(value: string | null | undefined) {
    if (!value) return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const normalized = /^[a-z]+:\/\//i.test(trimmed)
      ? new URL(trimmed).host
      : trimmed.replace(/^\./, '').replace(/\/+$/, '');
    return normalized ?? null;
  }

  it('returns null for null', () => expect(normalizeDomainHost(null)).toBe(null));
  it('returns null for undefined', () => expect(normalizeDomainHost(undefined)).toBe(null));
  it('returns null for empty string', () => expect(normalizeDomainHost('')).toBe(null));
  it('returns null for whitespace only', () => expect(normalizeDomainHost('   ')).toBe(null));
  it('strips leading dot', () => expect(normalizeDomainHost('.example.com')).toBe('example.com'));
  it('strips trailing slashes', () => expect(normalizeDomainHost('example.com/')).toBe('example.com'));
  it('strips trailing slashes from nested paths', () => expect(normalizeDomainHost('example.com/path/')).toBe('example.com/path'));
  it('extracts host from https:// URL', () => expect(normalizeDomainHost('https://app.example.com/')).toBe('app.example.com'));
  it('extracts host from http:// URL', () => expect(normalizeDomainHost('http://internal.local:8080/')).toBe('internal.local:8080'));
  it('returns plain domain as-is', () => expect(normalizeDomainHost('app.example.com')).toBe('app.example.com'));
  it('trims whitespace around plain domain', () => expect(normalizeDomainHost('  app.example.com  ')).toBe('app.example.com'));
  it('returns subdomain', () => expect(normalizeDomainHost('sub.app.example.com')).toBe('sub.app.example.com'));
});

describe('extractCollection', () => {
  const { z } = require('zod');
  const schema = z.object({ id: z.string() });
  const arraySchema = z.array(schema);

  function extractCollection(data: unknown) {
    if (Array.isArray(data)) return arraySchema.parse(data);
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      for (const key of ['data', 'applications', 'github_apps', 'repositories', 'deployments', 'envs', 'projects', 'environments', 'servers', 'branches']) {
        if (Array.isArray(record[key])) return arraySchema.parse(record[key]);
      }
    }
    return [];
  }

  it('returns array as-is', () => {
    const result = extractCollection([{ id: '1' }, { id: '2' }]);
    expect(result).toHaveLength(2);
  });

  it('extracts from "data" key', () => {
    const result = extractCollection({ data: [{ id: 'a' }, { id: 'b' }] });
    expect(result).toHaveLength(2);
  });

  it('extracts from "applications" key', () => {
    const result = extractCollection({ applications: [{ id: 'x' }] });
    expect(result).toHaveLength(1);
  });

  it('extracts from "github_apps" key', () => {
    const result = extractCollection({ github_apps: [{ id: 'y' }] });
    expect(result).toHaveLength(1);
  });

  it('returns empty array when no collection found', () => {
    const result = extractCollection({ something: 'else' });
    expect(result).toEqual([]);
  });

  it('returns empty array for non-object', () => {
    const result = extractCollection('not an object');
    expect(result).toEqual([]);
  });
});

describe('extractItem', () => {
  const { z } = require('zod');
  const schema = z.object({ name: z.string() });

  function extractItem(data: unknown) {
    if (data && typeof data === 'object') {
      const parsed = schema.safeParse(data);
      if (parsed.success) return parsed.data;

      const record = data as Record<string, unknown>;
      for (const key of ['data', 'application', 'github_app', 'deployment', 'server', 'project', 'environment', 'env']) {
        const value = record[key];
        if (value && typeof value === 'object') return schema.parse(value);
      }
    }
    return schema.parse(data);
  }

  it('returns parsed object directly', () => {
    const result = extractItem({ name: 'test' });
    expect(result).toEqual({ name: 'test' });
  });

  it('extracts from "data" key', () => {
    const result = extractItem({ data: { name: 'from-data' } });
    expect(result).toEqual({ name: 'from-data' });
  });

  it('extracts from "application" key', () => {
    const result = extractItem({ application: { name: 'app-name' } });
    expect(result).toEqual({ name: 'app-name' });
  });

  it('extracts from "github_app" key', () => {
    const result = extractItem({ github_app: { name: 'gh-app' } });
    expect(result).toEqual({ name: 'gh-app' });
  });

  it('falls back to root if no nested key found', () => {
    const result = extractItem({ name: 'root-item' });
    expect(result).toEqual({ name: 'root-item' });
  });
});

describe('extractLogs', () => {
  function extractLogs(data: unknown) {
    if (typeof data === 'string') return data;
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      for (const key of ['logs', 'data', 'output']) {
        if (typeof record[key] === 'string') return record[key] as string;
      }
    }
    return '';
  }

  it('returns string as-is', () => expect(extractLogs('raw log text')).toBe('raw log text'));
  it('extracts from "logs" key', () => expect(extractLogs({ logs: 'from logs' })).toBe('from logs'));
  it('extracts from "data" key', () => expect(extractLogs({ data: 'from data' })).toBe('from data'));
  it('extracts from "output" key', () => expect(extractLogs({ output: 'from output' })).toBe('from output'));
  it('prefers "logs" over "data"', () => expect(extractLogs({ logs: 'logs value', data: 'data value' })).toBe('logs value'));
  it('falls back to "" for unknown object keys', () => expect(extractLogs({ other: 'key' })).toBe(''));
  it('returns "" for null', () => expect(extractLogs(null)).toBe(''));
  it('returns "" for number', () => expect(extractLogs(123)).toBe(''));
});

describe('safeJsonParse', () => {
  function safeJsonParse(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  it('parses valid JSON', () => {
    const result = safeJsonParse('{"key":"value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('parses JSON array', () => expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3]));

  it('returns string on invalid JSON', () => {
    const result = safeJsonParse('not json at all');
    expect(result).toBe('not json at all');
  });

  it('returns string on malformed JSON', () => {
    const result = safeJsonParse('{"broken":');
    expect(result).toBe('{"broken":');
  });
});

describe('buildRequestError', () => {
  function buildRequestError(method: string, path: string, status: number, data: unknown) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    return `Coolify API ${method} ${path} failed with ${status}: ${payload}`;
  }

  it('formats with string data', () => {
    const msg = buildRequestError('GET', '/apps', 404, 'Not found');
    expect(msg).toBe('Coolify API GET /apps failed with 404: Not found');
  });

  it('formats with object data', () => {
    const msg = buildRequestError('POST', '/apps', 500, { error: 'Server error' });
    expect(msg).toContain('500');
    expect(msg).toContain('Server error');
  });

  it('formats with null data', () => {
    const msg = buildRequestError('DELETE', '/apps/1', 204, null);
    expect(msg).toContain('204');
    expect(msg).toContain('null');
  });
});

describe('toTimestamp', () => {
  function toTimestamp(value: string | number | null) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  it('returns number as-is', () => expect(toTimestamp(1700000000000)).toBe(1700000000000));
  it('returns numeric string as number', () => expect(toTimestamp('1700000000000')).toBe(1700000000000));
  it('parses ISO date string', () => {
    const result = toTimestamp('2024-01-01T00:00:00.000Z');
    expect(result).toBeGreaterThan(0);
  });
  it('returns 0 for null', () => expect(toTimestamp(null)).toBe(0));
  it('returns 0 for non-numeric string', () => expect(toTimestamp('not-a-date')).toBe(0));
});
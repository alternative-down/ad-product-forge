/**
 * Tests for helper functions in coolify/manager.ts.
 * Tests the real exported helpers from the source module.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeDomainHost,
  extractCollection,
  extractItem,
  extractLogs,
  toApplicationSummary,
  safeJsonParse,
  buildRequestError,
} from './manager';
import { z } from 'zod';

// ─── normalizeDomainHost ────────────────────────────────────────────────────

describe('normalizeDomainHost', () => {
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

// ─── extractCollection ──────────────────────────────────────────────────────

describe('extractCollection', () => {
  const schema = z.object({ id: z.string() });

  it('returns array as-is', () => {
    const result = extractCollection([{ id: '1' }, { id: '2' }], schema);
    expect(result).toHaveLength(2);
  });

  it('extracts from "data" key', () => {
    const result = extractCollection({ data: [{ id: 'a' }, { id: 'b' }] }, schema);
    expect(result).toHaveLength(2);
  });

  it('extracts from "applications" key', () => {
    const result = extractCollection({ applications: [{ id: 'x' }] }, schema);
    expect(result).toHaveLength(1);
  });

  it('extracts from "github_apps" key', () => {
    const result = extractCollection({ github_apps: [{ id: 'y' }] }, schema);
    expect(result).toHaveLength(1);
  });

  it('extracts from "repositories" key', () => {
    const result = extractCollection({ repositories: [{ id: 'r' }] }, schema);
    expect(result).toHaveLength(1);
  });

  it('returns empty array when no collection found', () => {
    const result = extractCollection({ something: 'else' }, schema);
    expect(result).toEqual([]);
  });

  it('returns empty array for non-object', () => {
    const result = extractCollection('not an object', schema);
    expect(result).toEqual([]);
  });
});

// ─── extractItem ──────────────────────────────────────────────────────────

describe('extractItem', () => {
  const schema = z.object({ name: z.string() });

  it('returns parsed object directly', () => {
    const result = extractItem({ name: 'test' }, schema);
    expect(result).toEqual({ name: 'test' });
  });

  it('extracts from "data" key', () => {
    const result = extractItem({ data: { name: 'from-data' } }, schema);
    expect(result).toEqual({ name: 'from-data' });
  });

  it('extracts from "application" key', () => {
    const result = extractItem({ application: { name: 'app-name' } }, schema);
    expect(result).toEqual({ name: 'app-name' });
  });

  it('extracts from "github_app" key', () => {
    const result = extractItem({ github_app: { name: 'gh-app' } }, schema);
    expect(result).toEqual({ name: 'gh-app' });
  });

  it('falls back to root if no nested key found', () => {
    const result = extractItem({ name: 'root-item' }, schema);
    expect(result).toEqual({ name: 'root-item' });
  });
});

// ─── extractLogs ─────────────────────────────────────────────────────────────

describe('extractLogs', () => {
  it('returns string as-is', () => expect(extractLogs('raw log text')).toBe('raw log text'));
  it('extracts from "logs" key', () => expect(extractLogs({ logs: 'from logs' })).toBe('from logs'));
  it('extracts from "data" key', () => expect(extractLogs({ data: 'from data' })).toBe('from data'));
  it('extracts from "output" key', () => expect(extractLogs({ output: 'from output' })).toBe('from output'));
  it('prefers "logs" over "data"', () => expect(extractLogs({ logs: 'logs value', data: 'data value' })).toBe('logs value'));
  it('falls back to "" for unknown object keys', () => expect(extractLogs({ other: 'key' })).toBe(''));
  it('returns "" for null', () => expect(extractLogs(null)).toBe(''));
  it('returns "" for number', () => expect(extractLogs(123)).toBe(''));
});

// ─── safeJsonParse ─────────────────────────────────────────────────────────

describe('safeJsonParse', () => {
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

// ─── buildRequestError ──────────────────────────────────────────────────────

describe('buildRequestError', () => {
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

// ─── toApplicationSummary ──────────────────────────────────────────────────

describe('toApplicationSummary', () => {
  it('maps all fields correctly', () => {
    const input = {
      uuid: 'app-1',
      name: 'My App',
      fqdn: 'https://myapp.com',
      status: 'running',
      repository: 'org/repo',
      git_branch: 'main',
    };
    const result = toApplicationSummary(input);
    expect(result.applicationUuid).toBe('app-1');
    expect(result.name).toBe('My App');
    expect(result.fqdn).toBe('https://myapp.com');
    expect(result.status).toBe('running');
    expect(result.repository).toBe('org/repo');
    expect(result.branch).toBe('main');
  });

  it('treats missing fields as null', () => {
    const result = toApplicationSummary({ uuid: 'app-1' });
    expect(result.name).toBeNull();
    expect(result.fqdn).toBeNull();
    expect(result.status).toBeNull();
  });
});

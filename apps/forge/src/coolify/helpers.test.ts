/**
 * Unit tests for coolify/helpers.ts — pure helper functions.
 * All functions are tested without HTTP mocking since they are pure/isolated.
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
  toApplicationSummary,
  toApplicationDetails,
  toEnvDetails,
} from './helpers';
import { ApplicationSchema, ApplicationEnvSchema } from './schemas';

// ─── normalizeDomainHost ─────────────────────────────────────────────────────

describe('normalizeDomainHost', () => {
  it('returns null for null', () => expect(normalizeDomainHost(null)).toBeNull());
  it('returns null for undefined', () => expect(normalizeDomainHost(undefined)).toBeNull());
  it('returns null for empty string', () => expect(normalizeDomainHost('')).toBeNull());
  it('returns null for whitespace only', () => expect(normalizeDomainHost('   ')).toBeNull());
  it('returns host from http URL', () => expect(normalizeDomainHost('http://example.com:8080/path')).toBe('example.com:8080'));
  it('returns host from https URL', () => expect(normalizeDomainHost('https://app.example.com')).toBe('app.example.com'));
  it('strips leading dot', () => expect(normalizeDomainHost('.example.com')).toBe('example.com'));
  it('strips trailing slash', () => expect(normalizeDomainHost('example.com/')).toBe('example.com'));
  it('strips both leading dot and trailing slash', () => expect(normalizeDomainHost('.example.com/')).toBe('example.com'));
  it('returns trimmed string when no URL pattern', () => expect(normalizeDomainHost('  app.example.com  ')).toBe('app.example.com'));
  it('returns as-is when plain domain', () => expect(normalizeDomainHost('my-app.example.com')).toBe('my-app.example.com'));
});

// ─── extractCollection ────────────────────────────────────────────────────────

const itemSchema = z.object({ id: z.number(), name: z.string() });

describe('extractCollection', () => {
  it('returns array as-is when already an array', () => {
    const data = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];
    expect(extractCollection(data, itemSchema)).toEqual(data);
  });

  it('returns [] when data is null', () => expect(extractCollection(null, itemSchema)).toEqual([]));
  it('returns [] when data is undefined', () => expect(extractCollection(undefined, itemSchema)).toEqual([]));
  it('returns [] when data is a primitive', () => expect(extractCollection(42, itemSchema)).toEqual([]));
  it('returns [] when no recognized collection key', () => {
    expect(extractCollection({ unrelated: [{ id: 1 }] }, itemSchema)).toEqual([]);
  });

  it('extracts from data key', () => {
    const data = { data: [{ id: 1, name: 'x' }] };
    expect(extractCollection(data, itemSchema)).toEqual(data.data);
  });
  it('extracts from applications key', () => {
    const data = { applications: [{ id: 2, name: 'y' }] };
    expect(extractCollection(data, itemSchema)).toEqual(data.applications);
  });
  it('extracts from github_apps key', () => {
    const data = { github_apps: [{ id: 3, name: 'z' }] };
    expect(extractCollection(data, itemSchema)).toEqual(data.github_apps);
  });
  it('extracts from repositories key', () => {
    const data = { repositories: [{ id: 4, name: 'w' }] };
    expect(extractCollection(data, itemSchema)).toEqual(data.repositories);
  });
  it('extracts from deployments key', () => {
    const data = { deployments: [{ id: 5, name: 'v' }] };
    expect(extractCollection(data, itemSchema)).toEqual(data.deployments);
  });
  it('extracts from envs key', () => {
    const data = { envs: [{ id: 6, name: 'u' }] };
    expect(extractCollection(data, itemSchema)).toEqual(data.envs);
  });
  it('extracts from projects key', () => {
    const data = { projects: [{ id: 7, name: 't' }] };
    expect(extractCollection(data, itemSchema)).toEqual(data.projects);
  });
  it('extracts from environments key', () => {
    const data = { environments: [{ id: 8, name: 's' }] };
    expect(extractCollection(data, itemSchema)).toEqual(data.environments);
  });
  it('extracts from servers key', () => {
    const data = { servers: [{ id: 9, name: 'r' }] };
    expect(extractCollection(data, itemSchema)).toEqual(data.servers);
  });
  it('extracts from branches key', () => {
    const data = { branches: [{ id: 10, name: 'q' }] };
    expect(extractCollection(data, itemSchema)).toEqual(data.branches);
  });
  it('parses extracted items through schema', () => {
    const data = { data: [{ id: 'not-a-number', name: 'invalid' }] };
    expect(() => extractCollection(data, itemSchema)).toThrow();
  });
});

// ─── extractItem ─────────────────────────────────────────────────────────────

describe('extractItem', () => {
  it('extracts from deployment key', () => {
    const data = { deployment: { id: 1, name: 'Deployment 1' } };
    const result = extractItem(data, itemSchema);
    expect(result).toEqual({ id: 1, name: 'Deployment 1' });
  });
  it('extracts from application key', () => {
    const data = { application: { id: 2, name: 'App 2' } };
    expect(extractItem(data, itemSchema)).toEqual({ id: 2, name: 'App 2' });
  });
  it('extracts from github_app key', () => {
    const data = { github_app: { id: 3, name: 'GH App' } };
    expect(extractItem(data, itemSchema)).toEqual({ id: 3, name: 'GH App' });
  });
  it('extracts from server key', () => {
    const data = { server: { id: 4, name: 'Server 4' } };
    expect(extractItem(data, itemSchema)).toEqual({ id: 4, name: 'Server 4' });
  });
  it('extracts from env key', () => {
    const data = { env: { id: 5, name: 'Env 5' } };
    expect(extractItem(data, itemSchema)).toEqual({ id: 5, name: 'Env 5' });
  });
  it('extracts from project key', () => {
    const data = { project: { id: 6, name: 'Project 6' } };
    expect(extractItem(data, itemSchema)).toEqual({ id: 6, name: 'Project 6' });
  });
  it('extracts from environment key', () => {
    const data = { environment: { id: 7, name: 'Env 7' } };
    expect(extractItem(data, itemSchema)).toEqual({ id: 7, name: 'Env 7' });
  });
  it('extracts from data key (second priority)', () => {
    const data = { data: { id: 8, name: 'Data item' } };
    expect(extractItem(data, itemSchema)).toEqual({ id: 8, name: 'Data item' });
  });
  it('parses data directly when it matches schema', () => {
    const data = { id: 9, name: 'Direct item' };
    expect(extractItem(data, itemSchema)).toEqual({ id: 9, name: 'Direct item' });
  });
  it('throws when no valid item found', () => {
    expect(() => extractItem({ unrelated: true }, itemSchema)).toThrow('Failed to extract item');
  });
  it('throws when data is primitive', () => {
    expect(() => extractItem(42, itemSchema)).toThrow('Failed to extract item');
  });
  it('throws when data is null', () => {
    expect(() => extractItem(null, itemSchema)).toThrow('Failed to extract item');
  });
});

// ─── extractLogs ─────────────────────────────────────────────────────────────

describe('extractLogs', () => {
  it('returns string as-is', () => expect(extractLogs('build log output')).toBe('build log output'));
  it('extracts from logs key', () => {
    const data = { logs: 'log output here', other: 'ignored' };
    expect(extractLogs(data)).toBe('log output here');
  });
  it('extracts data key when logs key absent', () => {
    const data = { data: 'data logs' };
    expect(extractLogs(data)).toBe('data logs');
  });
  it('extracts output key when logs and data absent or non-string', () => {
    const data = { output: 'log from output', info: 'nope' };
    expect(extractLogs(data)).toBe('log from output');
  });
  it('logs key takes precedence over data key', () => {
    const data = { data: 'data logs', logs: 'logs-first' };
    expect(extractLogs(data)).toBe('logs-first');
  });
  it('logs key takes precedence over output key', () => {
    const data = { output: 'stdout', logs: 'logs-wins' };
    expect(extractLogs(data)).toBe('logs-wins');
  });
  it('data key takes precedence over output key', () => {
    const data = { output: 'stdout', data: 'data-wins' };
    expect(extractLogs(data)).toBe('data-wins');
  });
  it('returns empty string for null', () => expect(extractLogs(null)).toBe(''));
  it('returns empty string for undefined', () => expect(extractLogs(undefined)).toBe(''));
  it('returns empty string for object with no recognized keys', () => {
    expect(extractLogs({ foo: 'bar' })).toBe('');
  });
  it('returns empty string when keys contain non-string values', () => {
    expect(extractLogs({ logs: 123 })).toBe('');
  });
});

// ─── removeUndefined ─────────────────────────────────────────────────────────

describe('removeUndefined', () => {
  it('removes keys with undefined values', () => {
    const result = removeUndefined({ a: 1, b: undefined, c: 'hello' });
    expect(result).toEqual({ a: 1, c: 'hello' });
    expect(Object.hasOwn(result, 'b')).toBe(false);
  });
  it('keeps null values', () => {
    const result = removeUndefined({ a: null, b: undefined });
    expect(result).toEqual({ a: null });
  });
  it('keeps falsy values (0, false, empty string)', () => {
    const result = removeUndefined({ a: 0, b: false, c: '', d: undefined });
    expect(result).toEqual({ a: 0, b: false, c: '' });
  });
  it('returns empty object when all undefined', () => {
    expect(removeUndefined({ a: undefined, b: undefined })).toEqual({});
  });
  it('returns empty object when input is empty', () => {
    expect(removeUndefined({})).toEqual({});
  });
});

// ─── safeJsonParse ────────────────────────────────────────────────────────────

describe('safeJsonParse', () => {
  it('parses valid JSON object', () => {
    const result = safeJsonParse('{"key":"value","num":42}');
    expect(result).toEqual({ key: 'value', num: 42 });
  });
  it('parses valid JSON array', () => {
    const result = safeJsonParse('[1,2,3]');
    expect(result).toEqual([1, 2, 3]);
  });
  it('returns string on invalid JSON', () => {
    const result = safeJsonParse('not valid json {');
    expect(result).toBe('not valid json {');
  });
  it('returns string on incomplete JSON', () => {
    expect(safeJsonParse('{"incomplete":')).toBe('{"incomplete":');
  });
  it('returns string on empty input', () => {
    expect(safeJsonParse('')).toBe('');
  });
});

// ─── buildRequestError ────────────────────────────────────────────────────────

describe('buildRequestError', () => {
  it('formats with object data as JSON string', () => {
    const result = buildRequestError('GET', '/applications', 404, { error: 'Not found' });
    expect(result).toBe('Coolify API GET /applications failed with 404: {"error":"Not found"}');
  });
  it('formats with string data', () => {
    const result = buildRequestError('POST', '/deployments', 500, 'Internal error');
    expect(result).toBe('Coolify API POST /deployments failed with 500: Internal error');
  });
  it('includes method, path, and status code', () => {
    const result = buildRequestError('DELETE', '/applications/app-001', 403, null);
    expect(result).toContain('403');
    expect(result).toContain('DELETE');
    expect(result).toContain('/applications/app-001');
  });
});

// ─── toTimestamp ─────────────────────────────────────────────────────────────

describe('toTimestamp', () => {
  it('returns number as-is', () => expect(toTimestamp(1700000000000)).toBe(1700000000000));
  it('converts numeric string to number', () => expect(toTimestamp('1700000000000')).toBe(1700000000000));
  it('converts ISO date string to timestamp', () => {
    const result = toTimestamp('2024-01-01T00:00:00.000Z');
    expect(result).toBeGreaterThan(0);
  });
  it('converts RFC date string', () => {
    const result = toTimestamp('Nov 15 2024');
    expect(result).toBeGreaterThan(0);
  });
  it('returns 0 for non-parseable string', () => expect(toTimestamp('not-a-date')).toBe(0));
  it('returns 0 for null', () => expect(toTimestamp(null)).toBe(0));
  it('returns 0 for empty string', () => expect(toTimestamp('')).toBe(0));
  it('handles negative numbers', () => expect(toTimestamp(-1000)).toBe(-1000));
  it('handles scientific notation string', () => expect(toTimestamp('1e12')).toBe(1e12));
});

// ─── toApplicationSummary ─────────────────────────────────────────────────────

describe('toApplicationSummary', () => {
  it('maps all fields from ApplicationSchema', () => {
    const app = { uuid: 'app-001', name: 'My App', fqdn: 'https://myapp.com', status: 'running', repository: 'org/repo', git_branch: 'main' };
    const result = toApplicationSummary(app);
    expect(result).toEqual({
      applicationUuid: 'app-001',
      name: 'My App',
      fqdn: 'https://myapp.com',
      status: 'running',
      repository: 'org/repo',
      branch: 'main',
    });
  });
  it('uses null when fields are missing', () => {
    const app = { uuid: 'app-002' };
    const result = toApplicationSummary(app);
    expect(result).toEqual({
      applicationUuid: 'app-002',
      name: null, fqdn: null, status: null, repository: null, branch: null,
    });
  });
});

// ─── toApplicationDetails ─────────────────────────────────────────────────────

describe('toApplicationDetails', () => {
  it('includes ports_exposes field', () => {
    const app = { uuid: 'app-003', name: 'Detail App', fqdn: 'https://detail.com', status: 'stopped', repository: 'org/repo', git_branch: 'develop', ports_exposes: '3000' };
    const result = toApplicationDetails(app);
    expect(result).toEqual({
      applicationUuid: 'app-003', name: 'Detail App', fqdn: 'https://detail.com',
      status: 'stopped', repository: 'org/repo', branch: 'develop', port: '3000',
    });
  });
  it('port is null when ports_exposes missing', () => {
    const result = toApplicationDetails({ uuid: 'app-004' });
    expect(result.port).toBeNull();
  });
});

// ─── toEnvDetails ────────────────────────────────────────────────────────────

describe('toEnvDetails', () => {
  it('maps all fields from ApplicationEnvSchema', () => {
    const env = { uuid: 'env-001', id: 1, key: 'DATABASE_URL', value: 'postgres://...', is_preview: true, is_build_time: false, is_literal: true, is_multiline: false, is_shown_once: true };
    const result = toEnvDetails(env);
    expect(result).toEqual({
      envId: 'env-001', key: 'DATABASE_URL', value: 'postgres://...',
      isPreview: true, isBuildTime: false, isLiteral: true,
      isMultiline: false, isShownOnce: true,
    });
  });
  it('uses id as fallback when uuid missing', () => {
    const env = { id: 42, key: 'KEY', value: 'val' };
    const result = toEnvDetails(env);
    expect(result.envId).toBe(42);
  });
  it('uses key as fallback when both uuid and id missing', () => {
    const env = { key: 'MY_KEY', value: 'my-val' };
    const result = toEnvDetails(env);
    expect(result.envId).toBe('MY_KEY');
  });
  it('defaults boolean fields to false', () => {
    const env = { key: 'X', value: 'y' };
    const result = toEnvDetails(env);
    expect(result).toEqual({
      envId: 'X', key: 'X', value: 'y',
      isPreview: false, isBuildTime: false, isLiteral: false,
      isMultiline: false, isShownOnce: false,
    });
  });
  it('defaults value to empty string', () => {
    const result = toEnvDetails({ key: 'EMPTY' });
    expect(result.value).toBe('');
  });
});
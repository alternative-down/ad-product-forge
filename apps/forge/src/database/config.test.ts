import { beforeEach, describe, expect, test, vi } from 'vitest';

const mkdirCalls: [string, { recursive: boolean }][] = [];

vi.mock('node:fs', () => ({
  default: Object.assign(
    () => {},
    { mkdirSync: vi.fn((p: string, o: { recursive: false }) => mkdirCalls.push([p, o])) }
  ),
  mkdirSync: vi.fn((p: string, o: { recursive: false }) => mkdirCalls.push([p, o])),
}));

vi.mock('node:path', () => ({
  resolve: vi.fn().mockImplementation((cwd: string, p: string) => {
    if (p.startsWith('/')) return p;
    const normalized = p.replace(/^\.\//, '');
    const base = cwd.endsWith('/') ? cwd.slice(0, -1) : cwd;
    return `${base}/${normalized}`;
  }),
  join: vi.fn().mockImplementation((...parts: string[]) => parts.join('/')),
  default: {
    resolve: vi.fn().mockImplementation((cwd: string, p: string) => {
      if (p.startsWith('/')) return p;
      const normalized = p.replace(/^\.\//, '');
      const base = cwd.endsWith('/') ? cwd.slice(0, -1) : cwd;
      return `${base}/${normalized}`;
    }),
    join: vi.fn().mockImplementation((...parts: string[]) => parts.join('/')),
  },
}));

import { getAppDatabasePath } from './config';

describe('getAppDatabasePath', () => {
  beforeEach(() => {
    mkdirCalls.length = 0;
    vi.clearAllMocks();
    delete process.env.FORGE_DATA_PATH;
  });

  test('defaults to ./data relative to cwd', () => {
    const result = getAppDatabasePath();
    // resolve(cwd, './data') → cwd + '/data'
    expect(result).toMatch(/\/data\/agents\.db$/);
    expect(result.endsWith('/agents.db')).toBe(true);
  });

  test('uses FORGE_DATA_PATH env var when set', () => {
    process.env.FORGE_DATA_PATH = '/custom/path';
    const result = getAppDatabasePath();
    expect(result).toMatch(/\/custom\/path\/agents\.db$/);
  });

  test('resolves absolute path from FORGE_DATA_PATH env var', () => {
    process.env.FORGE_DATA_PATH = '/absolute/custom/data';
    const result = getAppDatabasePath();
    expect(result).toBe('/absolute/custom/data/agents.db');
  });

  test('calls fs.mkdirSync with recursive=true for data directory', () => {
    getAppDatabasePath();
    const dataDirCall = mkdirCalls.find(([p]) => p.includes('data'));
    expect(dataDirCall).toBeDefined();
    expect(dataDirCall![1]).toEqual({ recursive: true });
  });

  test('appends agents.db to the resolved data directory', () => {
    const result = getAppDatabasePath();
    expect(result.endsWith('/agents.db')).toBe(true);
  });

  test('handles relative path in FORGE_DATA_PATH', () => {
    process.env.FORGE_DATA_PATH = 'relative/path';
    const result = getAppDatabasePath();
    expect(result).toMatch(/\/relative\/path\/agents\.db$/);
  });
});
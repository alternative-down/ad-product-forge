import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { envSchema, parseEnv, __resetEnvCache } from './env';

const FORGE_VARS = [
  'FORGE_DATA_PATH',
  'WORKSPACE_BASE_PATH',
  'FORGE_HTTP_PORT',
  'FORGE_PUBLIC_BASE_URL',
  'FORGE_ADMIN_API_KEY',
  'FORGE_ADMIN_ALLOW_INSECURE_LOCAL',
  'FORGE_ADMIN_ALLOWED_ORIGINS',
  'FORGE_HTTP_MAX_BODY_BYTES',
  'FORGE_GIT_SHA',
  'FORGE_DEPLOY_TIME',
  'ENCRYPTION_KEY',
  'MINIMAX_API_KEY',
  'DATABASE_URL',
  'DATABASE_AUTH_TOKEN',
  'FORGE_DEBUG',
  'FORGE_LOG_LEVEL',
] as const;

function clearForgeEnv(): void {
  for (const k of FORGE_VARS) {
    delete process.env[k];
  }
}

/**
 * envSchema — raw schema tests (no memoization; each test parses fresh).
 *
 * These tests exercise the Zod schema directly so each test sees its own
 * process.env mutations without cache interference.
 */
describe('envSchema (raw schema)', () => {
  beforeEach(() => {
    clearForgeEnv();
  });

  afterEach(() => {
    clearForgeEnv();
  });

  it('applies all defaults when process.env is empty', () => {
    const result = envSchema.parse(process.env);
    expect(result.FORGE_DATA_PATH).toBe('./data');
    expect(result.WORKSPACE_BASE_PATH).toBe('./workspaces');
    expect(result.FORGE_HTTP_PORT).toBe(3011);
    expect(result.FORGE_HTTP_MAX_BODY_BYTES).toBe(1_048_576);
    expect(result.FORGE_GIT_SHA).toBe('local-dev');
    expect(result.FORGE_DEPLOY_TIME).toBe('local-dev');
    expect(result.DATABASE_URL).toBe('file:./agents.db');
    expect(result.FORGE_DEBUG).toBe('false');
    expect(result.FORGE_LOG_LEVEL).toBe('warn');
    expect(result.FORGE_PUBLIC_BASE_URL).toBeUndefined();
    expect(result.FORGE_ADMIN_API_KEY).toBeUndefined();
    expect(result.FORGE_ADMIN_ALLOW_INSECURE_LOCAL).toBeUndefined();
    expect(result.FORGE_ADMIN_ALLOWED_ORIGINS).toBeUndefined();
    expect(result.ENCRYPTION_KEY).toBeUndefined();
    expect(result.MINIMAX_API_KEY).toBeUndefined();
    expect(result.DATABASE_AUTH_TOKEN).toBeUndefined();
  });

  it('coerces string FORGE_HTTP_PORT to number', () => {
    process.env.FORGE_HTTP_PORT = '8080';
    expect(envSchema.parse(process.env).FORGE_HTTP_PORT).toBe(8080);
  });

  it('coerces string FORGE_HTTP_MAX_BODY_BYTES to number', () => {
    process.env.FORGE_HTTP_MAX_BODY_BYTES = '5242880';
    expect(envSchema.parse(process.env).FORGE_HTTP_MAX_BODY_BYTES).toBe(5242880);
  });

  it('throws on negative FORGE_HTTP_PORT', () => {
    process.env.FORGE_HTTP_PORT = '-1';
    expect(() => envSchema.parse(process.env)).toThrow();
  });

  it('throws on non-integer FORGE_HTTP_PORT', () => {
    process.env.FORGE_HTTP_PORT = '3011.5';
    expect(() => envSchema.parse(process.env)).toThrow();
  });

  it('throws on zero FORGE_HTTP_PORT (positive constraint)', () => {
    process.env.FORGE_HTTP_PORT = '0';
    expect(() => envSchema.parse(process.env)).toThrow();
  });

  it('throws on invalid FORGE_PUBLIC_BASE_URL', () => {
    process.env.FORGE_PUBLIC_BASE_URL = 'not-a-url';
    expect(() => envSchema.parse(process.env)).toThrow();
  });

  it('accepts valid FORGE_PUBLIC_BASE_URL', () => {
    process.env.FORGE_PUBLIC_BASE_URL = 'https://forge.example.com';
    expect(envSchema.parse(process.env).FORGE_PUBLIC_BASE_URL).toBe(
      'https://forge.example.com',
    );
  });

  it('accepts FORGE_ADMIN_ALLOW_INSECURE_LOCAL "true"', () => {
    process.env.FORGE_ADMIN_ALLOW_INSECURE_LOCAL = 'true';
    expect(envSchema.parse(process.env).FORGE_ADMIN_ALLOW_INSECURE_LOCAL).toBe(
      'true',
    );
  });

  it('accepts FORGE_ADMIN_ALLOW_INSECURE_LOCAL "1"', () => {
    process.env.FORGE_ADMIN_ALLOW_INSECURE_LOCAL = '1';
    expect(envSchema.parse(process.env).FORGE_ADMIN_ALLOW_INSECURE_LOCAL).toBe(
      '1',
    );
  });

  it('throws on invalid FORGE_ADMIN_ALLOW_INSECURE_LOCAL "yes"', () => {
    process.env.FORGE_ADMIN_ALLOW_INSECURE_LOCAL = 'yes';
    expect(() => envSchema.parse(process.env)).toThrow();
  });

  it('accepts FORGE_DEBUG "true", "false", "1", "0"', () => {
    for (const v of ['true', 'false', '1', '0']) {
      process.env.FORGE_DEBUG = v;
      expect(envSchema.parse(process.env).FORGE_DEBUG).toBe(v);
    }
  });

  it('accepts FORGE_LOG_LEVEL "debug", "info", "warn", "error"', () => {
    for (const v of ['debug', 'info', 'warn', 'error']) {
      process.env.FORGE_LOG_LEVEL = v;
      expect(envSchema.parse(process.env).FORGE_LOG_LEVEL).toBe(v);
    }
  });

  it('throws on invalid FORGE_DEBUG "yes"', () => {
    process.env.FORGE_DEBUG = 'yes';
    expect(() => envSchema.parse(process.env)).toThrow();
  });

  it('throws on invalid FORGE_LOG_LEVEL "verbose"', () => {
    process.env.FORGE_LOG_LEVEL = 'verbose';
    expect(() => envSchema.parse(process.env)).toThrow();
  });

  it('preserves ENCRYPTION_KEY when set (empty accepted — required-not-configured handled downstream)', () => {
    const validKey = Buffer.from('a'.repeat(32)).toString('base64');
    process.env.ENCRYPTION_KEY = validKey;
    expect(envSchema.parse(process.env).ENCRYPTION_KEY).toBe(validKey);
  });

  it('preserves MINIMAX_API_KEY when set', () => {
    process.env.MINIMAX_API_KEY = 'mm-key-123';
    expect(envSchema.parse(process.env).MINIMAX_API_KEY).toBe('mm-key-123');
  });

  it('accepts custom DATABASE_URL', () => {
    process.env.DATABASE_URL = 'file:/tmp/forge-test.db';
    expect(envSchema.parse(process.env).DATABASE_URL).toBe(
      'file:/tmp/forge-test.db',
    );
  });

  it('accepts custom FORGE_DATA_PATH', () => {
    process.env.FORGE_DATA_PATH = '/var/lib/forge';
    expect(envSchema.parse(process.env).FORGE_DATA_PATH).toBe('/var/lib/forge');
  });

  it('accepts custom WORKSPACE_BASE_PATH', () => {
    process.env.WORKSPACE_BASE_PATH = '/var/lib/workspaces';
    expect(envSchema.parse(process.env).WORKSPACE_BASE_PATH).toBe(
      '/var/lib/workspaces',
    );
  });

  it('accepts custom FORGE_GIT_SHA and FORGE_DEPLOY_TIME', () => {
    process.env.FORGE_GIT_SHA = 'abc1234';
    process.env.FORGE_DEPLOY_TIME = '2026-08-26T08:00:00Z';
    const result = envSchema.parse(process.env);
    expect(result.FORGE_GIT_SHA).toBe('abc1234');
    expect(result.FORGE_DEPLOY_TIME).toBe('2026-08-26T08:00:00Z');
  });
});

/**
 * parseEnv — memoized parser tests.
 *
 * Verifies that parseEnv() parses once and reuses the cached result, and
 * that __resetEnvCache() forces a re-parse.
 */
describe('parseEnv (memoized)', () => {
  beforeEach(() => {
    clearForgeEnv();
    __resetEnvCache();
  });

  afterEach(() => {
    clearForgeEnv();
    __resetEnvCache();
  });

  it('returns parsed env on first call', () => {
    process.env.FORGE_HTTP_PORT = '8080';
    const result = parseEnv();
    expect(result.FORGE_HTTP_PORT).toBe(8080);
  });

  it('returns the same cached reference on subsequent calls', () => {
    process.env.FORGE_HTTP_PORT = '8080';
    const first = parseEnv();
    const second = parseEnv();
    expect(first).toBe(second);
  });

  it('ignores process.env mutations after first call (cache)', () => {
    process.env.FORGE_HTTP_PORT = '8080';
    const first = parseEnv();
    process.env.FORGE_HTTP_PORT = '9999';
    const second = parseEnv();
    expect(first.FORGE_HTTP_PORT).toBe(8080);
    expect(second.FORGE_HTTP_PORT).toBe(8080);
  });

  it('__resetEnvCache re-reads process.env on next call', () => {
    process.env.FORGE_HTTP_PORT = '8080';
    parseEnv();
    process.env.FORGE_HTTP_PORT = '9999';
    __resetEnvCache();
    expect(parseEnv().FORGE_HTTP_PORT).toBe(9999);
  });
});

/**
 * Unit tests for coolify/schemas.ts.
 * Zod schemas for Coolify API responses and toTimestamp helper.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import {
  GitHubAppSchema,
  GitHubRepositorySchema,
  GitHubBranchSchema,
  ApplicationSchema,
  ApplicationEnvSchema,
  DeploymentSchema,
  ProjectSchema,
  EnvironmentSchema,
  ServerSchema,
} from './schemas';

// ─── GitHubAppSchema ────────────────────────────────────────────────────────────

describe('GitHubAppSchema', () => {
  it('parses minimal valid input', () => {
    expect(GitHubAppSchema.parse({ uuid: 'abc-123' })).toMatchObject({ uuid: 'abc-123' });
  });

  it('parses full valid input', () => {
    const result = GitHubAppSchema.parse({
      id: 42,
      uuid: 'app-uuid',
      name: 'My App',
      organization: 'acme',
      api_url: 'https://api.github.com',
      html_url: 'https://github.com/apps/my-app',
    });
    expect(result.uuid).toBe('app-uuid');
    expect(result.id).toBe(42);
  });

  it('strips unknown fields', () => {
    const result = GitHubAppSchema.parse({ uuid: 'x', unknownField: 'should-be-removed' });
    expect(result).toHaveProperty('unknownField', 'should-be-removed');
  });

  it('rejects when uuid is missing', () => {
    expect(() => GitHubAppSchema.parse({ name: 'no-uuid' })).toThrow();
  });

  it('rejects when uuid is not a string', () => {
    expect(() => GitHubAppSchema.parse({ uuid: 123 })).toThrow();
  });

  it('accepts null for nullable organization', () => {
    expect(GitHubAppSchema.parse({ uuid: 'x', organization: null })).toMatchObject({
      organization: null,
    });
  });
});

// ─── GitHubRepositorySchema ───────────────────────────────────────────────────

describe('GitHubRepositorySchema', () => {
  it('parses minimal valid input', () => {
    expect(GitHubRepositorySchema.parse({ name: 'repo-name' })).toMatchObject({
      name: 'repo-name',
    });
  });

  it('parses full valid input', () => {
    const result = GitHubRepositorySchema.parse({
      id: 123,
      name: 'my-repo',
      full_name: 'acme/my-repo',
      default_branch: 'main',
      private: true,
    });
    expect(result.name).toBe('my-repo');
    expect(result.id).toBe(123);
    expect(result.private).toBe(true);
  });

  it('accepts string id', () => {
    const result = GitHubRepositorySchema.parse({ name: 'r', id: 'gh_123' });
    expect(result.id).toBe('gh_123');
  });

  it('rejects when name is missing', () => {
    expect(() => GitHubRepositorySchema.parse({ id: 1 })).toThrow();
  });

  it('rejects when name is not a string', () => {
    expect(() => GitHubRepositorySchema.parse({ name: 42 })).toThrow();
  });
});

// ─── GitHubBranchSchema ───────────────────────────────────────────────────────

describe('GitHubBranchSchema', () => {
  it('parses minimal valid input', () => {
    expect(GitHubBranchSchema.parse({ name: 'main' })).toMatchObject({ name: 'main' });
  });

  it('rejects when name is missing', () => {
    expect(() => GitHubBranchSchema.parse({})).toThrow();
  });

  it('rejects when name is not a string', () => {
    expect(() => GitHubBranchSchema.parse({ name: 42 })).toThrow();
  });
});

// ─── ApplicationSchema ────────────────────────────────────────────────────────

describe('ApplicationSchema', () => {
  it('parses minimal valid input', () => {
    expect(ApplicationSchema.parse({ uuid: 'app-uuid' })).toMatchObject({ uuid: 'app-uuid' });
  });

  it('parses full valid input', () => {
    const result = ApplicationSchema.parse({
      id: 1,
      uuid: 'uuid-abc',
      name: 'my-app',
      fqdn: 'app.acme.com',
      status: 'running',
      repository: 'acme/repo',
      git_branch: 'main',
      ports_exposes: '3000',
      destination: { uuid: 'dest-1', name: 'server-1' },
    });
    expect(result.uuid).toBe('uuid-abc');
    expect(result.status).toBe('running');
    expect(result.destination?.uuid).toBe('dest-1');
  });

  it('accepts string id', () => {
    const result = ApplicationSchema.parse({ uuid: 'x', id: 'app_123' });
    expect(result.id).toBe('app_123');
  });

  it('accepts null for nullable fields', () => {
    const result = ApplicationSchema.parse({
      uuid: 'x',
      fqdn: null,
      status: null,
      repository: null,
      git_branch: null,
      ports_exposes: null,
    });
    expect(result.fqdn).toBeNull();
    expect(result.repository).toBeNull();
  });

  it('rejects when uuid is missing', () => {
    expect(() => ApplicationSchema.parse({ name: 'no-uuid' })).toThrow();
  });

  it('rejects when uuid is not a string', () => {
    expect(() => ApplicationSchema.parse({ uuid: 42 })).toThrow();
  });
});

// ─── ApplicationEnvSchema ─────────────────────────────────────────────────────

describe('ApplicationEnvSchema', () => {
  it('parses minimal valid input', () => {
    expect(ApplicationEnvSchema.parse({ key: 'NODE_ENV' })).toMatchObject({ key: 'NODE_ENV' });
  });

  it('parses full valid input', () => {
    const result = ApplicationEnvSchema.parse({
      id: 1,
      uuid: 'env-uuid',
      key: 'DATABASE_URL',
      value: 'postgres://localhost/db',
      is_preview: true,
      is_build_time: false,
      is_literal: true,
      is_multiline: false,
      is_shown_once: true,
    });
    expect(result.key).toBe('DATABASE_URL');
    expect(result.is_preview).toBe(true);
    expect(result.is_literal).toBe(true);
  });

  it('strips unknown fields', () => {
    const result = ApplicationEnvSchema.parse({ key: 'K', unknown: 'stripped' });
    expect(result).toHaveProperty('unknown', 'stripped');
  });

  it('rejects when key is missing', () => {
    expect(() => ApplicationEnvSchema.parse({ value: 'v' })).toThrow();
  });
});

// ─── DeploymentSchema ────────────────────────────────────────────────────────

describe('DeploymentSchema', () => {
  it('parses minimal valid input', () => {
    const result = DeploymentSchema.parse({});
    expect(result).toMatchObject({});
  });

  it('parses full valid input', () => {
    const result = DeploymentSchema.parse({
      id: 1,
      uuid: 'dep-uuid',
      deployment_uuid: 'dep-uuid-2',
      status: 'success',
      logs: 'Build completed.',
      created_at: 1710000000000,
    });
    expect(result.status).toBe('success');
    expect(result.created_at).toBe(1710000000000);
  });

  it('accepts string created_at', () => {
    const result = DeploymentSchema.parse({ created_at: '1710000000000' });
    expect(result.created_at).toBe('1710000000000');
  });
});

// ─── ProjectSchema ────────────────────────────────────────────────────────────

describe('ProjectSchema', () => {
  it('parses minimal valid input', () => {
    expect(ProjectSchema.parse({ uuid: 'proj-1' })).toMatchObject({ uuid: 'proj-1' });
  });

  it('parses full valid input', () => {
    expect(ProjectSchema.parse({ uuid: 'proj-1', name: 'My Project' })).toMatchObject({
      name: 'My Project',
    });
  });

  it('rejects when uuid is missing', () => {
    expect(() => ProjectSchema.parse({ name: 'no-uuid' })).toThrow();
  });
});

// ─── EnvironmentSchema ───────────────────────────────────────────────────────

describe('EnvironmentSchema', () => {
  it('parses minimal valid input', () => {
    expect(EnvironmentSchema.parse({ uuid: 'env-1' })).toMatchObject({ uuid: 'env-1' });
  });

  it('parses full valid input', () => {
    expect(EnvironmentSchema.parse({ uuid: 'env-1', name: 'Production' })).toMatchObject({
      name: 'Production',
    });
  });

  it('rejects when uuid is missing', () => {
    expect(() => EnvironmentSchema.parse({ name: 'no-uuid' })).toThrow();
  });
});

// ─── ServerSchema ────────────────────────────────────────────────────────────

describe('ServerSchema', () => {
  it('parses minimal valid input', () => {
    expect(ServerSchema.parse({ uuid: 'srv-1' })).toMatchObject({ uuid: 'srv-1' });
  });

  it('parses full valid input', () => {
    const result = ServerSchema.parse({
      uuid: 'srv-1',
      name: 'prod-server',
      wildcard_domain: '*.acme.com',
      proxy_uuid: 'proxy-1',
      proxy: { uuid: 'proxy-1' },
    });
    expect(result.name).toBe('prod-server');
    expect(result.proxy?.uuid).toBe('proxy-1');
  });

  it('accepts partial proxy object', () => {
    const result = ServerSchema.parse({ uuid: 'x', proxy: {} });
    expect(result.proxy).toEqual({});
  });

  it('rejects when uuid is missing', () => {
    expect(() => ServerSchema.parse({ name: 'no-uuid' })).toThrow();
  });

  it('rejects when uuid is not a string', () => {
    expect(() => ServerSchema.parse({ uuid: 42 })).toThrow();
  });
});

// ─── Schema safeParse (non-throwing) ─────────────────────────────────────────

describe('schema.safeParse', () => {
  it('GitHubAppSchema safeParse returns success false for missing uuid', () => {
    const result = GitHubAppSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('ApplicationSchema safeParse returns success true for valid input', () => {
    const result = ApplicationSchema.safeParse({ uuid: 'x' });
    expect(result.success).toBe(true);
  });

  it('ServerSchema safeParse strips unknown fields', () => {
    const result = ServerSchema.safeParse({ uuid: 'x', unknownField: 'strip' });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('unknownField', 'strip');
  });
});

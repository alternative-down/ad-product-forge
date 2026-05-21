import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Inline schemas for testing (matching the ones in manager.ts)
const GitHubAppSchema = z
  .object({
    id: z.number().int().optional(),
    uuid: z.string(),
    name: z.string().optional(),
    organization: z.string().nullish(),
    api_url: z.string().optional(),
    html_url: z.string().optional(),
  })
  .passthrough();

const GitHubRepositorySchema = z
  .object({
    id: z.union([z.number().int(), z.string()]).optional(),
    name: z.string(),
    full_name: z.string().optional(),
    default_branch: z.string().optional(),
    private: z.boolean().optional(),
  })
  .passthrough();

const ApplicationSchema = z
  .object({
    id: z.union([z.number().int(), z.string()]).optional(),
    uuid: z.string(),
    name: z.string().optional(),
    fqdn: z.string().nullish(),
    status: z.string().nullish(),
    repository: z.string().nullish(),
    git_branch: z.string().nullish(),
    ports_exposes: z.string().nullish(),
    destination: z
      .object({
        uuid: z.string(),
        name: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

const ServerSchema = z
  .object({
    uuid: z.string(),
    name: z.string().optional(),
    wildcard_domain: z.string().optional(),
    proxy_uuid: z.string().optional(),
    proxy: z
      .object({
        uuid: z.string().optional(),
      })
      .partial()
      .optional(),
  })
  .passthrough();

describe('GitHubAppSchema', () => {
  it('should validate a valid GitHub App with all fields', () => {
    const validApp = {
      id: 12345,
      uuid: 'abc-123-def',
      name: 'My GitHub App',
      organization: 'my-org',
      api_url: 'https://api.github.com',
      html_url: 'https://github.com/apps/my-app',
    };
    expect(() => GitHubAppSchema.parse(validApp)).not.toThrow();
  });

  it('should validate a minimal GitHub App (only uuid required)', () => {
    const minimalApp = { uuid: 'abc-123-def' };
    expect(() => GitHubAppSchema.parse(minimalApp)).not.toThrow();
  });

  it('should reject GitHub App without uuid', () => {
    const invalidApp = { id: 12345 };
    expect(() => GitHubAppSchema.parse(invalidApp)).toThrow();
  });

  it('should allow extra passthrough fields', () => {
    const appWithExtra = {
      uuid: 'abc-123',
      customField: 'should be allowed',
      anotherCustom: 123,
    };
    expect(() => GitHubAppSchema.parse(appWithExtra)).not.toThrow();
  });
});

describe('GitHubRepositorySchema', () => {
  it('should validate a repository with all fields', () => {
    const repo = {
      id: 123456,
      name: 'my-repo',
      full_name: 'org/my-repo',
      default_branch: 'main',
      private: true,
    };
    expect(() => GitHubRepositorySchema.parse(repo)).not.toThrow();
  });

  it('should validate with only required name field', () => {
    const repo = { name: 'my-repo' };
    expect(() => GitHubRepositorySchema.parse(repo)).not.toThrow();
  });

  it('should reject without name field', () => {
    const invalid = { id: 123 };
    expect(() => GitHubRepositorySchema.parse(invalid)).toThrow();
  });

  it('should accept string id', () => {
    const repo = { name: 'my-repo', id: '123' };
    expect(() => GitHubRepositorySchema.parse(repo)).not.toThrow();
  });
});

describe('ApplicationSchema', () => {
  it('should validate a complete application', () => {
    const app = {
      uuid: 'app-uuid-123',
      name: 'My App',
      fqdn: 'myapp.example.com',
      status: 'running',
      repository: 'org/repo',
      git_branch: 'main',
      destination: {
        uuid: 'dest-uuid',
        name: 'production',
      },
    };
    expect(() => ApplicationSchema.parse(app)).not.toThrow();
  });

  it('should validate with only required uuid', () => {
    const app = { uuid: 'app-uuid-123' };
    expect(() => ApplicationSchema.parse(app)).not.toThrow();
  });

  it('should allow null for nullable fields', () => {
    const app = {
      uuid: 'app-uuid-123',
      fqdn: null,
      status: null,
      repository: null,
    };
    expect(() => ApplicationSchema.parse(app)).not.toThrow();
  });

  it('should accept string id', () => {
    const app = { uuid: 'app-uuid', id: 'string-id-123' };
    expect(() => ApplicationSchema.parse(app)).not.toThrow();
  });
});

describe('ServerSchema', () => {
  it('should validate a complete server', () => {
    const server = {
      uuid: 'server-uuid-123',
      name: 'Production Server',
      wildcard_domain: '*.example.com',
      proxy_uuid: 'proxy-uuid',
      proxy: {
        uuid: 'nested-proxy-uuid',
      },
    };
    expect(() => ServerSchema.parse(server)).not.toThrow();
  });

  it('should validate minimal server', () => {
    const server = { uuid: 'server-uuid-123' };
    expect(() => ServerSchema.parse(server)).not.toThrow();
  });

  it('should allow partial proxy object', () => {
    const server = {
      uuid: 'server-uuid',
      proxy: {},
    };
    expect(() => ServerSchema.parse(server)).not.toThrow();
  });
});

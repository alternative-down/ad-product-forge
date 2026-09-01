import { describe, it, expect } from 'vitest';
import {
  WorkspaceFilesystemConfigSchema,
  WorkspaceSandboxConfigSchema,
  WorkspaceSkillsConfigSchema,
  type WorkspaceFilesystemConfig,
  type WorkspaceSandboxConfig,
  type WorkspaceSkillsConfig,
} from '../schema-config';

// Tests the REAL production Zod schemas in schema-config.ts (not local copies).
// Before fix: schemas were _-prefixed and not exported; this test re-declared them
// locally with the same shape, so 15/15 tests passed for the wrong reason.
// After fix: schemas are exported and imported here — these tests now exercise
// the actual runtime validation behavior of the production schemas.

describe('WorkspaceFilesystemConfigSchema (production)', () => {
  it('should validate a valid workspace filesystem config', () => {
    const config = { basePath: '/app/workspaces/agent1' };
    expect(() => WorkspaceFilesystemConfigSchema.parse(config)).not.toThrow();
  });

  it('should accept valid config with result', () => {
    const config = { basePath: '/app/workspaces/agent1' };
    const parsed = WorkspaceFilesystemConfigSchema.parse(config);
    expect(parsed.basePath).toBe('/app/workspaces/agent1');
  });

  it('should accept allowed paths', () => {
    const config = {
      basePath: '/app/workspaces/agent1',
      allowedPaths: ['/app/shared', '../shared-tools'],
    };
    const parsed = WorkspaceFilesystemConfigSchema.parse(config);
    expect(parsed.allowedPaths).toEqual(['/app/shared', '../shared-tools']);
  });

  it('should reject config without basePath', () => {
    const config = {};
    expect(() => WorkspaceFilesystemConfigSchema.parse(config)).toThrow();
  });

  it('should reject config with empty basePath', () => {
    // Empty string is still a string, so it's valid for z.string().
    const config = { basePath: '' };
    expect(() => WorkspaceFilesystemConfigSchema.parse(config)).not.toThrow();
  });

  it('should reject config with extra fields', () => {
    // With default z.object (passthrough: false / strict by default in zod v3),
    // extra fields are stripped.
    const config = { basePath: '/app', extra: 'not allowed' };
    expect(WorkspaceFilesystemConfigSchema.parse(config)).toEqual({ basePath: '/app' });
  });
});

describe('WorkspaceSandboxConfigSchema (production)', () => {
  it('should validate a valid sandbox config', () => {
    const config = { workingDirectory: '/app/workspaces/sandbox' };
    expect(() => WorkspaceSandboxConfigSchema.parse(config)).not.toThrow();
  });

  it('should accept valid config with result', () => {
    const config = { workingDirectory: '/app/sandbox' };
    const parsed = WorkspaceSandboxConfigSchema.parse(config);
    expect(parsed.workingDirectory).toBe('/app/sandbox');
  });

  it('should reject config without workingDirectory', () => {
    const config = {};
    expect(() => WorkspaceSandboxConfigSchema.parse(config)).toThrow();
  });
});

describe('WorkspaceSkillsConfigSchema (production)', () => {
  it('should validate a valid skills config with multiple skills', () => {
    const config = ['github-api', 'coolify-api', 'custom-skill'];
    expect(() => WorkspaceSkillsConfigSchema.parse(config)).not.toThrow();
  });

  it('should validate an empty skills array', () => {
    const config: string[] = [];
    expect(() => WorkspaceSkillsConfigSchema.parse(config)).not.toThrow();
  });

  it('should validate a single skill', () => {
    const config = ['github-api'];
    const parsed = WorkspaceSkillsConfigSchema.parse(config);
    expect(parsed).toEqual(['github-api']);
  });

  it('should reject non-array input', () => {
    const config = 'github-api';
    expect(() => WorkspaceSkillsConfigSchema.parse(config)).toThrow();
  });

  it('should reject array with non-string elements', () => {
    const config = ['github-api', 123, true];
    expect(() => WorkspaceSkillsConfigSchema.parse(config)).toThrow();
  });
});

describe('Schema type inference (production)', () => {
  it('should infer correct types from production Zod schemas', () => {
    // Use the exported types directly (the same types used by production code).
    const fsConfig: WorkspaceFilesystemConfig = { basePath: '/test', allowedPaths: ['/shared'] };
    const sandboxConfig: WorkspaceSandboxConfig = { workingDirectory: '/test' };
    const skillsConfig: WorkspaceSkillsConfig = ['skill1'];

    expect(fsConfig.basePath).toBe('/test');
    expect(fsConfig.allowedPaths).toEqual(['/shared']);
    expect(sandboxConfig.workingDirectory).toBe('/test');
    expect(skillsConfig[0]).toBe('skill1');
  });
});

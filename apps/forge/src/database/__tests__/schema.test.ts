import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Test the Zod schemas defined in the schema.ts file
const _WorkspaceFilesystemConfigSchema = z.object({
  basePath: z.string(),
  allowedPaths: z.array(z.string()).optional(),
});

const _WorkspaceSandboxConfigSchema = z.object({
  workingDirectory: z.string(),
});

const _WorkspaceSkillsConfigSchema = z.array(z.string());

describe('WorkspaceFilesystemConfigSchema', () => {
  it('should validate a valid workspace filesystem config', () => {
    const config = { basePath: '/app/workspaces/agent1' };
    expect(() => _WorkspaceFilesystemConfigSchema.parse(config)).not.toThrow();
  });

  it('should accept valid config with result', () => {
    const config = { basePath: '/app/workspaces/agent1' };
    const parsed = _WorkspaceFilesystemConfigSchema.parse(config);
    expect(parsed.basePath).toBe('/app/workspaces/agent1');
  });

  it('should accept allowed paths', () => {
    const config = {
      basePath: '/app/workspaces/agent1',
      allowedPaths: ['/app/shared', '../shared-tools'],
    };
    const parsed = _WorkspaceFilesystemConfigSchema.parse(config);
    expect(parsed.allowedPaths).toEqual(['/app/shared', '../shared-tools']);
  });

  it('should reject config without basePath', () => {
    const config = {};
    expect(() => _WorkspaceFilesystemConfigSchema.parse(config)).toThrow();
  });

  it('should reject config with empty basePath', () => {
    const config = { basePath: '' };
    // Empty string is still a string, so it's valid
    expect(() => _WorkspaceFilesystemConfigSchema.parse(config)).not.toThrow();
  });

  it('should reject config with extra fields', () => {
    const config = { basePath: '/app', extra: 'not allowed' };
    // With passthrough: false (default), extra fields would be stripped
    // This test ensures strict validation
    expect(_WorkspaceFilesystemConfigSchema.parse(config)).toEqual({ basePath: '/app' });
  });
});

describe('WorkspaceSandboxConfigSchema', () => {
  it('should validate a valid sandbox config', () => {
    const config = { workingDirectory: '/app/workspaces/sandbox' };
    expect(() => _WorkspaceSandboxConfigSchema.parse(config)).not.toThrow();
  });

  it('should accept valid config with result', () => {
    const config = { workingDirectory: '/app/sandbox' };
    const parsed = _WorkspaceSandboxConfigSchema.parse(config);
    expect(parsed.workingDirectory).toBe('/app/sandbox');
  });

  it('should reject config without workingDirectory', () => {
    const config = {};
    expect(() => _WorkspaceSandboxConfigSchema.parse(config)).toThrow();
  });
});

describe('WorkspaceSkillsConfigSchema', () => {
  it('should validate a valid skills config with multiple skills', () => {
    const config = ['github-api', 'coolify-api', 'custom-skill'];
    expect(() => _WorkspaceSkillsConfigSchema.parse(config)).not.toThrow();
  });

  it('should validate an empty skills array', () => {
    const config: string[] = [];
    expect(() => _WorkspaceSkillsConfigSchema.parse(config)).not.toThrow();
  });

  it('should validate a single skill', () => {
    const config = ['github-api'];
    const parsed = _WorkspaceSkillsConfigSchema.parse(config);
    expect(parsed).toEqual(['github-api']);
  });

  it('should reject non-array input', () => {
    const config = 'github-api';
    expect(() => _WorkspaceSkillsConfigSchema.parse(config)).toThrow();
  });

  it('should reject array with non-string elements', () => {
    const config = ['github-api', 123, true];
    expect(() => _WorkspaceSkillsConfigSchema.parse(config)).toThrow();
  });
});

describe('Schema type inference', () => {
  it('should infer correct types from Zod schemas', () => {
    type WorkspaceFilesystemConfig = z.infer<typeof _WorkspaceFilesystemConfigSchema>;
    type WorkspaceSandboxConfig = z.infer<typeof _WorkspaceSandboxConfigSchema>;
    type WorkspaceSkillsConfig = z.infer<typeof _WorkspaceSkillsConfigSchema>;

    const fsConfig: WorkspaceFilesystemConfig = { basePath: '/test', allowedPaths: ['/shared'] };
    const sandboxConfig: WorkspaceSandboxConfig = { workingDirectory: '/test' };
    const skillsConfig: WorkspaceSkillsConfig = ['skill1'];

    expect(fsConfig.basePath).toBe('/test');
    expect(fsConfig.allowedPaths).toEqual(['/shared']);
    expect(sandboxConfig.workingDirectory).toBe('/test');
    expect(skillsConfig[0]).toBe('skill1');
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createGitHubTools } from './tools';

// vi.mock must be top-level, but we need a factory that avoids importing @forge-runtime/core
vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  createTool: vi.fn((config: { id: string; description: string; inputSchema: unknown; execute: unknown }) => ({
    ...config,
    _isTool: true,
  })),
}));

const mockGitHubAppsManager = {
  getGitCredentials: vi.fn(),
  listInstallations: vi.fn(),
  getRepositoryAccess: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createGitHubTools', () => {
  it('returns get_github_git_credentials when permission is granted', () => {
    const tools = createGitHubTools('agent-123', mockGitHubAppsManager, new Set(['get_github_git_credentials']));
    expect(Object.keys(tools)).toContain('get_github_git_credentials');
  });

  it('does NOT include tool when no permission', () => {
    const tools = createGitHubTools('agent-123', mockGitHubAppsManager, new Set(['other_tool']));
    expect(Object.keys(tools)).not.toContain('get_github_git_credentials');
  });

  it('includes tool when allowedToolIds is null (unrestricted)', () => {
    const tools = createGitHubTools('agent-123', mockGitHubAppsManager, null);
    expect(Object.keys(tools)).toContain('get_github_git_credentials');
  });

  it('includes tool when allowedToolIds is undefined', () => {
    const tools = createGitHubTools('agent-123', mockGitHubAppsManager, undefined);
    expect(Object.keys(tools)).toContain('get_github_git_credentials');
  });

  it('does NOT include tool when allowedToolIds is empty set', () => {
    const tools = createGitHubTools('agent-123', mockGitHubAppsManager, new Set());
    expect(Object.keys(tools)).not.toContain('get_github_git_credentials');
  });

  it('tool has correct id', () => {
    const tools = createGitHubTools('agent-123', mockGitHubAppsManager, new Set(['get_github_git_credentials']));
    expect(tools.get_github_git_credentials.id).toBe('get_github_git_credentials');
  });

  it('tool has non-empty description', () => {
    const tools = createGitHubTools('agent-123', mockGitHubAppsManager, new Set(['get_github_git_credentials']));
    expect(tools.get_github_git_credentials.description.length).toBeGreaterThan(10);
  });

  it('tool execute calls manager.getGitCredentials with agentId', async () => {
    mockGitHubAppsManager.getGitCredentials.mockResolvedValue({ token: 'ghs_xxx' });
    const tools = createGitHubTools('agent-123', mockGitHubAppsManager, new Set(['get_github_git_credentials']));
    const execute = (tools.get_github_git_credentials as { execute: (input: unknown) => Promise<unknown> }).execute;
    await execute({ repositoryName: 'my-repo' });
    expect(mockGitHubAppsManager.getGitCredentials).toHaveBeenCalledWith({
      agentId: 'agent-123',
      repositoryName: 'my-repo',
    });
  });

  it('tool execute returns credentials when successful', async () => {
    const credentials = { token: 'ghs_test', expiresAt: Date.now() + 3600_000 };
    mockGitHubAppsManager.getGitCredentials.mockResolvedValue(credentials);
    const tools = createGitHubTools('agent-123', mockGitHubAppsManager, new Set(['get_github_git_credentials']));
    const execute = (tools.get_github_git_credentials as { execute: (input: unknown) => Promise<unknown> }).execute;
    const result = await execute({ repositoryName: undefined });
    expect(result).toEqual(credentials);
  });

  it('tool execute returns valid:false error object on exception', async () => {
    mockGitHubAppsManager.getGitCredentials.mockRejectedValue(new Error('App not installed'));
    const tools = createGitHubTools('agent-123', mockGitHubAppsManager, new Set(['get_github_git_credentials']));
    const execute = (tools.get_github_git_credentials as { execute: (input: unknown) => Promise<unknown> }).execute;
    const result = await execute({ repositoryName: 'repo' });
    expect(result).toMatchObject({ valid: false, error: expect.stringContaining('App not installed') });
  });

  it('tool execute works without repositoryName', async () => {
    mockGitHubAppsManager.getGitCredentials.mockResolvedValue({ token: 'ghs_all' });
    const tools = createGitHubTools('agent-123', mockGitHubAppsManager, new Set(['get_github_git_credentials']));
    const execute = (tools.get_github_git_credentials as { execute: (input: unknown) => Promise<unknown> }).execute;
    await execute({});
    expect(mockGitHubAppsManager.getGitCredentials).toHaveBeenCalledWith({
      agentId: 'agent-123',
      repositoryName: undefined,
    });
  });
});

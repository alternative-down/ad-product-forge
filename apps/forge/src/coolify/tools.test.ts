import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createCoolifyTools } from './tools';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  createTool: vi.fn((config: { id: string; description: string; inputSchema: unknown; execute: unknown }) => ({
    ...config,
    _isTool: true,
  })),
}));

const mockCoolifyManager = {
  getCredentials: vi.fn(),
  getServers: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createCoolifyTools', () => {
  it('returns get_coolify_credentials when permission is granted', () => {
    const tools = createCoolifyTools(mockCoolifyManager, new Set(['get_coolify_credentials']));
    expect(Object.keys(tools)).toContain('get_coolify_credentials');
  });

  it('does NOT include tool when no permission', () => {
    const tools = createCoolifyTools(mockCoolifyManager, new Set(['other_tool']));
    expect(Object.keys(tools)).not.toContain('get_coolify_credentials');
  });

  it('includes tool when allowedToolIds is null (unrestricted)', () => {
    const tools = createCoolifyTools(mockCoolifyManager, null);
    expect(Object.keys(tools)).toContain('get_coolify_credentials');
  });

  it('includes tool when allowedToolIds is undefined', () => {
    const tools = createCoolifyTools(mockCoolifyManager, undefined);
    expect(Object.keys(tools)).toContain('get_coolify_credentials');
  });

  it('does NOT include tool when allowedToolIds is empty set', () => {
    const tools = createCoolifyTools(mockCoolifyManager, new Set());
    expect(Object.keys(tools)).not.toContain('get_coolify_credentials');
  });

  it('tool has correct id', () => {
    const tools = createCoolifyTools(mockCoolifyManager, new Set(['get_coolify_credentials']));
    expect(tools.get_coolify_credentials.id).toBe('get_coolify_credentials');
  });

  it('tool execute calls coolify.getCredentials()', async () => {
    mockCoolifyManager.getCredentials.mockResolvedValue({ baseUrl: 'https://coolify.example.com', token: 'ckey_xxx' });
    const tools = createCoolifyTools(mockCoolifyManager, new Set(['get_coolify_credentials']));
    const execute = (tools.get_coolify_credentials as { execute: () => Promise<unknown> }).execute;
    await execute();
    expect(mockCoolifyManager.getCredentials).toHaveBeenCalledOnce();
  });

  it('tool execute returns credentials when successful', async () => {
    const credentials = { baseUrl: 'https://coolify.example.com', token: 'ckey_test' };
    mockCoolifyManager.getCredentials.mockResolvedValue(credentials);
    const tools = createCoolifyTools(mockCoolifyManager, new Set(['get_coolify_credentials']));
    const execute = (tools.get_coolify_credentials as { execute: () => Promise<unknown> }).execute;
    const result = await execute();
    expect(result).toEqual(credentials);
  });

  it('tool execute returns valid:false error object on exception', async () => {
    mockCoolifyManager.getCredentials.mockRejectedValue(new Error('Coolify not configured'));
    const tools = createCoolifyTools(mockCoolifyManager, new Set(['get_coolify_credentials']));
    const execute = (tools.get_coolify_credentials as { execute: () => Promise<unknown> }).execute;
    const result = await execute();
    expect(result).toMatchObject({ valid: false, error: expect.stringContaining('Coolify not configured') });
  });

  it('tool execute uses Error.message for non-Error thrown values', async () => {
    mockCoolifyManager.getCredentials.mockRejectedValue('string error');
    const tools = createCoolifyTools(mockCoolifyManager, new Set(['get_coolify_credentials']));
    const execute = (tools.get_coolify_credentials as { execute: () => Promise<unknown> }).execute;
    const result = await execute();
    expect(result).toMatchObject({ valid: false, error: 'string error' });
  });
});

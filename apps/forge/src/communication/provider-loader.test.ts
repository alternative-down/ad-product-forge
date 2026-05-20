import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockForgeDebug } = vi.hoisted(() => ({ mockForgeDebug: vi.fn() }));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: mockForgeDebug,
}));

const discordProvider = {
  id: 'discord',
  getSelfContact: vi.fn().mockRejectedValue(new Error('invalid token')),
  dispose: vi.fn(),
  sendMessage: vi.fn(),
};

vi.mock('../discord-account', () => ({
  createDiscordProvider: vi.fn(() => discordProvider),
}));

vi.mock('../email-account', () => ({
  createEmailProvider: vi.fn(() => ({
    id: 'email',
    sendMessage: vi.fn(),
  })),
}));

vi.mock('./internal-chat-provider', () => ({
  createInternalChatProvider: vi.fn(() => ({
    id: 'internal-chat',
    sendMessage: vi.fn(),
  })),
}));

import { loadCommunicationProviders } from './provider-loader';

describe('loadCommunicationProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the persistent rejection so every test gets a fresh mock state.
    discordProvider.getSelfContact.mockRejectedValue(new Error('invalid token'));
  });

  it('skips Discord when getSelfContact throws and logs via forgeDebug', async () => {
    const providers = await loadCommunicationProviders({
      discord: { channels: [], token: 'valid-token' },
      email: {
        imap: {
          host: 'imap.example.com',
          port: 993,
          secure: true,
          user: 'agent@example.com',
          password: 'password',
        },
        smtp: {
          host: 'smtp.example.com',
          port: 465,
          secure: true,
          user: 'agent@example.com',
          password: 'password',
        },
      },
    });

    expect(providers.map((p) => p.id)).toEqual(['email']);
    expect(discordProvider.getSelfContact).toHaveBeenCalledOnce();
    expect(mockForgeDebug).toHaveBeenCalledOnce();
    expect(mockForgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'provider-loader',
        level: 'warn',
        message: 'Skipping Discord provider because it failed to start',
      }),
    );
  });

  it('skips Discord when its credentials are malformed (token missing)', async () => {
    const credentials = {
      discord: { channels: [] },
    } as unknown as Parameters<typeof loadCommunicationProviders>[0];

    const providers = await loadCommunicationProviders(credentials);

    expect(providers).toEqual([]);
    expect(discordProvider.getSelfContact).not.toHaveBeenCalled();
    expect(mockForgeDebug).toHaveBeenCalledOnce();
    expect(mockForgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'provider-loader',
        level: 'warn',
        message: 'Skipping Discord provider because it failed to start',
      }),
    );
  });

  it('loads internal-chat provider when internalChat config is provided', async () => {
    const mockService = {
      /* minimal InternalChatService */
    } as any;
    const providers = await loadCommunicationProviders(
      { 'internal-chat': { agentId: 'agent-1', displayName: 'Test Agent' } },
      { internalChat: mockService },
    );
    expect(providers.map((p) => p.id)).toContain('internal-chat');
    expect(providers).toHaveLength(1);
  });

  it('throws when internal-chat credentials provided but internalChat config missing', async () => {
    await expect(
      loadCommunicationProviders({ 'internal-chat': { agentId: 'agent-1' } }),
    ).rejects.toThrow('Internal chat provider requires the internalChat service');
  });

  it('loads Discord provider when getSelfContact succeeds', async () => {
    discordProvider.getSelfContact.mockResolvedValueOnce({
      id: 'discord-user',
      displayName: 'Discord User',
    });
    const providers = await loadCommunicationProviders({
      discord: { channels: [], token: 'valid-token' },
    });
    expect(providers.map((p) => p.id)).toContain('discord');
  });

  it('loads multiple providers concurrently (internal-chat + discord + email)', async () => {
    discordProvider.getSelfContact.mockResolvedValueOnce({
      id: 'discord-user',
      displayName: 'Discord User',
    });
    const providers = await loadCommunicationProviders(
      {
        'internal-chat': { agentId: 'agent-1' },
        discord: { channels: [], token: 'valid-token' },
        email: {
          imap: {
            host: 'imap.example.com',
            port: 993,
            secure: true,
            user: 'a@b.com',
            password: 'pw',
          },
          smtp: {
            host: 'smtp.example.com',
            port: 465,
            secure: true,
            user: 'a@b.com',
            password: 'pw',
          },
        },
      },
      { internalChat: {} as any },
    );
    expect(providers.map((p) => p.id).sort()).toEqual(['discord', 'email', 'internal-chat']);
  });

  it('skips Discord but still loads other providers when Discord getSelfContact throws', async () => {
    discordProvider.getSelfContact.mockRejectedValueOnce(new Error('bad token'));
    const mockService = {} as any;
    const providers = await loadCommunicationProviders(
      {
        'internal-chat': { agentId: 'agent-1' },
        discord: { channels: [], token: 'bad-token' },
        email: {
          imap: {
            host: 'imap.example.com',
            port: 993,
            secure: true,
            user: 'a@b.com',
            password: 'pw',
          },
          smtp: {
            host: 'smtp.example.com',
            port: 465,
            secure: true,
            user: 'a@b.com',
            password: 'pw',
          },
        },
      },
      { internalChat: mockService },
    );
    expect(providers.map((p) => p.id).sort()).toEqual(['email', 'internal-chat']);
  });

  it('skips Discord when discord credentials are invalid zod parse', async () => {
    const badCredentials = { discord: {} } as any;
    const providers = await loadCommunicationProviders(badCredentials);
    expect(providers).toEqual([]);
    expect(mockForgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'provider-loader',
        level: 'warn',
        message: 'Skipping Discord provider because it failed to start',
      }),
    );
  });

  it('logs warning via forgeDebug when Discord fails to start', async () => {
    discordProvider.getSelfContact.mockRejectedValueOnce(new Error('network error'));
    await loadCommunicationProviders({ discord: { channels: [], token: 'network-fail' } });
    expect(mockForgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'provider-loader',
        level: 'warn',
        message: 'Skipping Discord provider because it failed to start',
      }),
    );
  });
});

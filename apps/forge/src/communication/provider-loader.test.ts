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
        imap: { host: 'imap.example.com', port: 993, secure: true, user: 'agent@example.com', password: 'password' },
        smtp: { host: 'smtp.example.com', port: 465, secure: true, user: 'agent@example.com', password: 'password' },
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
});
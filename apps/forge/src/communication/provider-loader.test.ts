import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

const mockDiscordProvider = {
  id: 'discord',
  getSelfContact: vi.fn(),
  dispose: vi.fn(),
  sendMessage: vi.fn(),
};

vi.mock('../discord-account', () => ({
  createDiscordProvider: vi.fn(() => mockDiscordProvider),
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
  });

  it('skips Discord when the provider fails to start', async () => {
    mockDiscordProvider.getSelfContact.mockRejectedValueOnce(new Error('invalid token'));

    const providers = await loadCommunicationProviders({
      discord: { channels: [], token: 'valid-token' },
      email: {
        imap: { host: 'imap.example.com', port: 993, secure: true, user: 'agent@example.com', password: 'password' },
        smtp: { host: 'smtp.example.com', port: 465, secure: true, user: 'agent@example.com', password: 'password' },
      },
    });

    expect(providers.map((p) => p.id)).toEqual(['email']);
    expect(mockDiscordProvider.dispose).toHaveBeenCalledOnce();
  });

  it('skips Discord when its credentials are malformed', async () => {
    const credentials = {
      discord: { channels: [] },
    } as unknown as Parameters<typeof loadCommunicationProviders>[0];

    const providers = await loadCommunicationProviders(credentials);

    expect(providers).toEqual([]);
    expect(mockDiscordProvider.getSelfContact).not.toHaveBeenCalled();
    expect(mockDiscordProvider.dispose).not.toHaveBeenCalled();
  });
});

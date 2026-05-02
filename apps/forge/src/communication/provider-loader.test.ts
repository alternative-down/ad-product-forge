import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadCommunicationProviders } from './provider-loader';

const discordProvider = {
  id: 'discord',
  getSelfContact: vi.fn(),
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

describe('loadCommunicationProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips Discord when the provider fails to start', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    discordProvider.getSelfContact.mockRejectedValueOnce(new Error('invalid token'));

    const providers = await loadCommunicationProviders({
      discord: {
        token: 'invalid',
        channels: [],
      },
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

    expect(providers.map((provider) => provider.id)).toEqual(['email']);
    expect(discordProvider.dispose).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();

    warn.mockRestore();
  });

  it('skips Discord when its credentials are malformed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const credentials = {
      discord: {
        channels: [],
      },
    } as unknown as Parameters<typeof loadCommunicationProviders>[0];

    const providers = await loadCommunicationProviders(credentials);

    expect(providers).toEqual([]);
    expect(discordProvider.getSelfContact).not.toHaveBeenCalled();
    expect(discordProvider.dispose).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();

    warn.mockRestore();
  });
});

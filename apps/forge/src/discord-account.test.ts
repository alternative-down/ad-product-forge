import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDiscordProvider } from './discord-account';

const mockUser = {
  id: 'bot-user-id',
  username: 'test-bot',
  globalName: 'Test Bot',
  tag: 'test-bot#1234',
};

let mockClientInstance: Record<string, any>;

vi.mock('discord.js', () => {
  class MockClient {
    constructor() {
      mockClientInstance = {
        login: vi.fn(async () => {
          mockClientInstance.user = mockUser;
          return undefined;
        }),
        on: vi.fn(),
        once: vi.fn(),
        removeAllListeners: vi.fn(),
        destroy: vi.fn(),
        user: null as typeof mockUser | null,
        channels: { cache: new Map() },
      };
      return mockClientInstance;
    }
  }

  return {
    Client: MockClient,
    GatewayIntentBits: {
      Guilds: 1 << 0, GuildMembers: 1 << 1, GuildMessages: 1 << 2,
      DirectMessages: 1 << 3, MessageContent: 1 << 4,
    },
    ChannelType: { DM: 1, GuildText: 0 },
    Events: { Ready: 'ready', MessageCreate: 'messageCreate' },
    Collection: Map,
    Partials: { Channel: 'Channel', Message: 'Message' },
    Message: vi.fn(),
    User: vi.fn(),
  };
});

vi.mock('@forge-runtime/core', () => ({ forgeDebug: vi.fn() }));

describe('discord-account', () => {
  let provider: ReturnType<typeof createDiscordProvider>;

  afterEach(() => {
    if (provider?.dispose) provider.dispose();
    vi.clearAllMocks();
  });

  describe('createDiscordProvider', () => {
    const wait = () => new Promise(r => setTimeout(r, 30));

    it('should return a provider object', async () => {
      provider = createDiscordProvider({ token: 'test-token' });
      await wait();
      expect(provider).toBeDefined();
    });

    it('should return object with sendMessage method', async () => {
      provider = createDiscordProvider({ token: 'test-token' });
      await wait();
      expect(typeof provider.sendMessage).toBe('function');
    });

    it('should return object with id property', async () => {
      provider = createDiscordProvider({ token: 'test-token' });
      await wait();
      expect(typeof (provider as any).id).toBe('string');
    });

    it('should return object with dispose method', async () => {
      provider = createDiscordProvider({ token: 'test-token' });
      await wait();
      expect(typeof provider.dispose).toBe('function');
    });

    it('should return object with onMessage method', async () => {
      provider = createDiscordProvider({ token: 'test-token' });
      await wait();
      expect(typeof provider.onMessage).toBe('function');
    });

    it('should accept empty channels array', async () => {
      provider = createDiscordProvider({ token: 'test-token', channels: [] });
      await wait();
      expect(provider).toBeDefined();
    });

    it('should accept channels with respondToMentionsOnly true', async () => {
      provider = createDiscordProvider({
        token: 'test-token',
        channels: [{ channelId: '123', channelName: 'test-channel', respondToMentionsOnly: true }],
      });
      await wait();
      expect(provider).toBeDefined();
    });

    it('should accept channels with respondToMentionsOnly false', async () => {
      provider = createDiscordProvider({
        token: 'test-token',
        channels: [{ channelId: '456', respondToMentionsOnly: false }],
      });
      await wait();
      expect(provider).toBeDefined();
    });

    it('should accept multiple channels', async () => {
      provider = createDiscordProvider({
        token: 'test-token',
        channels: [
          { channelId: 'ch1', respondToMentionsOnly: true },
          { channelId: 'ch2', respondToMentionsOnly: false },
        ],
      });
      await wait();
      expect(provider).toBeDefined();
    });

    it('should work without channels option', async () => {
      provider = createDiscordProvider({ token: 'test-token' });
      await wait();
      expect(provider).toBeDefined();
    });

    it('should accept undefined channels', async () => {
      provider = createDiscordProvider({ token: 'test-token', channels: undefined });
      await wait();
      expect(provider).toBeDefined();
    });

    it('should invoke Client login with the provided token', async () => {
      provider = createDiscordProvider({ token: 'my-secret-token' });
      await wait();
      expect(mockClientInstance.login).toHaveBeenCalledWith('my-secret-token');
    });

    it('should register messageCreate event on Client after login resolves', async () => {
      provider = createDiscordProvider({ token: 'test-token' });
      await wait();
      expect(mockClientInstance.on).toHaveBeenCalledWith('messageCreate', expect.any(Function));
    });

    it('should dispose without throwing', async () => {
      provider = createDiscordProvider({ token: 'test-token' });
      await wait();
      expect(() => provider.dispose()).not.toThrow();
    });

    it('should call removeAllListeners on dispose', async () => {
      provider = createDiscordProvider({ token: 'test-token' });
      await wait();
      provider.dispose();
      expect(mockClientInstance.removeAllListeners).toHaveBeenCalled();
    });

    it('should call client destroy on dispose', async () => {
      provider = createDiscordProvider({ token: 'test-token' });
      await wait();
      provider.dispose();
      expect(mockClientInstance.destroy).toHaveBeenCalled();
    });

    it('should accept token with special characters', async () => {
      provider = createDiscordProvider({ token: 'tok_en.123-456+789/0' });
      await wait();
      expect(provider).toBeDefined();
    });

    it('should handle very long channel names', async () => {
      provider = createDiscordProvider({
        token: 'test-token',
        channels: [{ channelId: 'ch-long', channelName: 'a'.repeat(200), respondToMentionsOnly: false }],
      });
      await wait();
      expect(provider).toBeDefined();
    });

    it('should return id that is the hardcoded string "discord"', async () => {
      provider = createDiscordProvider({ token: 'test-token' });
      await wait();
      expect((provider as any).id).toBe('discord');
    });

    it('should have sendMessage as async function', async () => {
      provider = createDiscordProvider({ token: 'test-token' });
      await wait();
      expect(provider.sendMessage.constructor.name).toBe('AsyncFunction');
    });

    it('should call login only once per provider instance', async () => {
      provider = createDiscordProvider({ token: 'test-token' });
      await wait();
      expect(mockClientInstance.login).toHaveBeenCalledTimes(1);
    });

    it('should set user on client after login', async () => {
      provider = createDiscordProvider({ token: 'test-token' });
      await wait();
      expect(mockClientInstance.user).not.toBeNull();
      expect(mockClientInstance.user?.id).toBe('bot-user-id');
    });
  });
});

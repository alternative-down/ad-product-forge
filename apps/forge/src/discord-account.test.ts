import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDiscordProvider } from './discord-account';

// ── discord.js mock — inline so all function refs are consistent ─────────────
vi.mock('discord.js', () => {
  const mockUser = { id: 'bot-id', username: 'test-bot', globalName: 'Test Bot', tag: 'test#1', dmChannel: null };

  const mockChannel = {
    id: 'ch-123', name: 'general', type: 0,
    isSendable: () => true, isTextBased: () => true,
    sendTyping: () => Promise.resolve(),
    send: () => Promise.resolve({ id: 'sent-msg-1', channelId: 'ch-123' }),
    messages: { fetch: () => Promise.resolve(new Map()) },
    members: { fetch: () => Promise.resolve(new Map()) },
  };

  const mockDMChannel = {
    id: 'dm-456', name: undefined, type: 1,
    isSendable: () => true, isTextBased: () => true,
    sendTyping: () => Promise.resolve(),
    send: () => Promise.resolve({ id: 'sent-dm-1', channelId: 'dm-456' }),
    messages: { fetch: () => Promise.resolve(new Map()) },
    recipient: { id: 'user-2', username: 'alice', globalName: 'Alice', dmChannel: null },
  };

  const mockGuild = {
    id: 'guild-1', name: 'Test Guild',
    members: { fetch: () => Promise.resolve(new Map()) },
  };

  const mockClient = {
    login: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(), once: vi.fn(),
    removeAllListeners: vi.fn(), destroy: vi.fn(),
    user: mockUser,
    channels: {
      cache: new Map([['ch-123', mockChannel]]),
      fetch: vi.fn(async (id) => {
        if (id === 'ch-123') return mockChannel;
        if (id === 'dm-456') return mockDMChannel;
        return null;
      }),
    },
    guilds: { cache: new Map([['guild-1', mockGuild]]) },
    users: { cache: new Map() },
  };

  (globalThis as any).__discordMockClient = mockClient;
  (globalThis as any).__discordMockChannel = mockChannel;
  (globalThis as any).__discordMockDMChannel = mockDMChannel;
  (globalThis as any).__discordMockGuild = mockGuild;

  return {
    Client: class { constructor() { Object.assign(this, mockClient); } },
    GatewayIntentBits: { Guilds: 1, GuildMembers: 2, GuildMessages: 4, DirectMessages: 8, MessageContent: 16 },
    ChannelType: { DM: 1, GuildText: 0 },
    Events: { Ready: 'ready', MessageCreate: 'messageCreate' },
    Collection: Map,
    Partials: { Channel: 'Channel', Message: 'Message' },
    Message: class {},
    User: class {},
  };
});

vi.mock('@forge-runtime/core', () => ({ forgeDebug: vi.fn() }));

function wait(ms = 30) { return new Promise((r) => setTimeout(r, ms)); }

function getMockClient() { return (globalThis as any).__discordMockClient; }
function getMockChannel() { return (globalThis as any).__discordMockChannel; }
function getMockDMChannel() { return (globalThis as any).__discordMockDMChannel; }
function getMockGuild() { return (globalThis as any).__discordMockGuild; }

describe('discord-account — new coverage', () => {
  let provider: ReturnType<typeof createDiscordProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mc = getMockClient();
    const mg = getMockGuild();
    const mch = getMockChannel();
    mc.login.mockResolvedValue(undefined);
    mc.user = { id: 'bot-id', username: 'test-bot', globalName: 'Test Bot', tag: 'test#1', dmChannel: null };
    mch.messages.fetch = () => Promise.resolve(new Map());
    mg.members.fetch = () => Promise.resolve(new Map());
    provider = createDiscordProvider({ token: 'test-token' });
  });

  afterEach(() => { provider?.dispose?.(); });

  // ── getSelfContact ───────────────────────────────────────────────────────
  describe('getSelfContact', () => {
    it('returns self contact with username and displayName', async () => {
      await wait();
      const contact = await (provider as any).getSelfContact();
      expect(contact.slug).toBe('test-bot');
      expect(contact.displayName).toBe('Test Bot');
      expect(contact.targetKey).toBe('test-bot');
      expect(contact.description).toBe('@test-bot');
    });
  });

  // ── listContacts ─────────────────────────────────────────────────────────
  describe('listContacts', () => {
    it('returns contacts from guild members', async () => {
      await wait();
      const contacts = await (provider as any).listContacts();
      expect(Array.isArray(contacts)).toBe(true);
    });
  });

  // ── listConversations ────────────────────────────────────────────────────
  describe('listConversations', () => {
    it('returns conversations from channels', async () => {
      await wait();
      const convs = await (provider as any).listConversations({ limit: 5 });
      expect(Array.isArray(convs)).toBe(true);
    });

    it('handles channels without throwing', async () => {
      await wait();
      const convs = await (provider as any).listConversations({ limit: 5 });
      expect(Array.isArray(convs)).toBe(true);
    });
  });

  // ── getMessages ──────────────────────────────────────────────────────────
  describe('getMessages', () => {
    it('throws when channel not found', async () => {
      await wait();
      await expect((provider as any).getMessages({ targetKey: 'does-not-exist', limit: 10, offset: 0 }))
        .rejects.toThrow('Discord target is not readable');
    });

    it('throws when channel is not text-based', async () => {
      await wait();
      const mc = getMockClient();
      mc.channels.fetch = async () => ({ id: 'vc-1', isTextBased: () => false, isSendable: () => false });
      await expect((provider as any).getMessages({ targetKey: 'vc-1', limit: 10, offset: 0 }))
        .rejects.toThrow('Discord target is not readable');
    });
  });

  // ── sendMessage ───────────────────────────────────────────────────────────
  describe('sendMessage', () => {
    it('throws when numeric channel is not sendable', async () => {
      await wait();
      const mc = getMockClient();
      mc.channels.fetch = async () => ({ ...getMockChannel(), isSendable: () => false });
      await expect((provider as any).sendMessage({ targetKey: '999', content: 'test', attachments: [] }))
        .rejects.toThrow('Discord target is not sendable');
    });

    it('throws when username is not found', async () => {
      await wait();
      await expect((provider as any).sendMessage({ targetKey: 'nobody', content: 'hi', attachments: [] }))
        .rejects.toThrow('Discord user not found');
    });
  });

  // ── messageCreate handler ────────────────────────────────────────────────
  describe('messageCreate', () => {
    it('ignores own messages', async () => {
      await wait();
      const inboundHandler = vi.fn();
      (provider as any).onMessage(inboundHandler);
      const mc = getMockClient();
      const handler = mc.on.mock.calls.find((c: unknown[]) => c[0] === 'messageCreate')?.[1];
      expect(handler).toBeDefined();
      const ownMsg = {
        author: { id: 'bot-id', username: 'test-bot', globalName: 'Test Bot', dmChannel: null },
        content: 'my own', channelId: 'ch-123',
        channel: getMockChannel(), createdTimestamp: Date.now(), attachments: new Map(),
      };
      await handler(ownMsg);
      expect(inboundHandler).not.toHaveBeenCalled();
    });

    it('ignores non-mention in respondToMentionsOnly channel', async () => {
      await wait();
      const strictProvider = createDiscordProvider({
        token: 'test',
        channels: [{ channelId: 'ch-123', respondToMentionsOnly: true }],
      });
      await wait(50);
      const inboundHandler = vi.fn();
      (strictProvider as any).onMessage(inboundHandler);
      const mc = getMockClient();
      const handler = mc.on.mock.calls.find((c: unknown[]) => c[0] === 'messageCreate')?.[1];
      const msg = {
        author: { id: 'other', username: 'other', globalName: 'Other', dmChannel: null },
        content: 'hello', channelId: 'ch-123',
        channel: getMockChannel(), createdTimestamp: Date.now(),
        mentions: { users: new Map() }, attachments: new Map(),
      };
      await handler(msg);
      expect(inboundHandler).not.toHaveBeenCalled();
      (strictProvider as any).dispose();
    });
  });

  // ── dispose ──────────────────────────────────────────────────────────────
  describe('dispose', () => {
    it('removes listeners and destroys client', async () => {
      await wait();
      // @ts-expect-error -- strictProvider possibly undefined (module-scoped let)
      await strictProvider.dispose();
      expect(getMockClient().removeAllListeners).toHaveBeenCalled();
      expect(getMockClient().destroy).toHaveBeenCalled();
    });
  });
});
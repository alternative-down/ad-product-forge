import { describe, expect, it } from 'vitest';
import type {
  DiscordSendableChannel,
  DiscordOutboundFile,
  DiscordChannelConfig,
  DiscordProviderConfig,
} from './discord-types';

describe('DiscordSendableChannel', () => {
  it('is a valid type-level interface', () => {
    // TypeScript structural typing — any object with required fields satisfies it
    const mockChannel: DiscordSendableChannel = {
      id: '123',
      name: 'test-channel',
      sendTyping: async () => {},
      send: async (input) => {
        return {} as ReturnType<typeof mockChannel.send> extends Promise<infer R> ? R : never;
      },
      messages: {
        fetch: async (x: string | { limit: number; before?: string }) =>
          ({ id: typeof x === 'string' ? x : 'msg-123' }) as unknown as any,
      },
    };
    expect(mockChannel.id).toBe('123');
    expect(mockChannel.name).toBe('test-channel');
  });
});

describe('DiscordOutboundFile', () => {
  it('is a valid type-level interface', () => {
    const mockFile: DiscordOutboundFile = {
      attachment: Buffer.from('hello'),
      name: 'report.txt',
    };
    expect(Buffer.isBuffer(mockFile.attachment)).toBe(true);
    expect(mockFile.name).toBe('report.txt');
  });
});

describe('DiscordChannelConfig', () => {
  it('is a valid type-level interface', () => {
    const config: DiscordChannelConfig = {
      channelId: 'ch_456',
      channelName: 'alerts',
      respondToMentionsOnly: true,
    };
    expect(config.channelId).toBe('ch_456');
    expect(config.channelName).toBe('alerts');
    expect(config.respondToMentionsOnly).toBe(true);
  });

  it('allows optional channelName', () => {
    const config: DiscordChannelConfig = {
      channelId: 'ch_789',
      respondToMentionsOnly: false,
    };
    expect(config.channelName).toBeUndefined();
  });
});

describe('DiscordProviderConfig', () => {
  it('is a valid type-level interface', () => {
    const config: DiscordProviderConfig = {
      token: 'discord_bot_token_here',
      channels: [{ channelId: '100', channelName: 'general', respondToMentionsOnly: false }],
    };
    expect(config.token).toBe('discord_bot_token_here');
    expect(config.channels).toHaveLength(1);
  });

  it('allows channels to be undefined', () => {
    const config: DiscordProviderConfig = {
      token: 'token_only',
    };
    expect(config.channels).toBeUndefined();
  });
});

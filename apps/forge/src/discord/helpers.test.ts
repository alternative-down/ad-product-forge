/**
 * Unit tests for discord/helpers.ts
 *
 * Covers: getDiscordConversationName(channel, fallbackName?)
 *  - DM channel: uses recipient.globalName
 *  - DM channel: falls back to recipient.username
 *  - DM channel: falls back to fallbackName
 *  - DM channel: defaults to 'direct-message'
 *  - Non-DM channel: uses channel.name
 *  - Non-object channel: returns 'unknown-channel'
 *
 * Covers: getDiscordConversationParticipants(channel, messages)
 *  - Pulls globalName / username from channel.recipients
 *  - Pulls authorDisplayName from messages
 *  - Dedupes across the two sources
 *  - Returns [] for non-object channel
 */
import { describe, expect, it } from 'vitest';
import { ChannelType } from 'discord.js';
import {
  getDiscordConversationName,
  getDiscordConversationParticipants,
} from './helpers';

function makeDm(opts: { globalName?: string; username?: string; type?: number } = {}) {
  return {
    type: opts.type ?? ChannelType.DM,
    recipient: {
      ...(opts.globalName !== undefined ? { globalName: opts.globalName } : {}),
      ...(opts.username !== undefined ? { username: opts.username } : {}),
    },
  };
}

describe('getDiscordConversationName', () => {
  it('returns recipient.globalName for DM channels when available', () => {
    const channel = makeDm({ globalName: 'Alice', username: 'alice01' });
    expect(getDiscordConversationName(channel, 'fallback')).toBe('Alice');
  });

  it('falls back to recipient.username when globalName is missing', () => {
    const channel = makeDm({ username: 'alice01' });
    expect(getDiscordConversationName(channel, 'fallback')).toBe('alice01');
  });

  it('falls back to the provided fallbackName when recipient has no usable name', () => {
    const channel = { type: ChannelType.DM, recipient: {} };
    expect(getDiscordConversationName(channel, 'my-fallback')).toBe('my-fallback');
  });

  it('defaults to "direct-message" for DM with no fallback', () => {
    const channel = { type: ChannelType.DM, recipient: {} };
    expect(getDiscordConversationName(channel)).toBe('direct-message');
  });

  it('returns channel.name for non-DM channels', () => {
    const channel = { type: ChannelType.GuildText, name: 'general' };
    expect(getDiscordConversationName(channel)).toBe('general');
  });

  it('returns "unknown-channel" when channel is not an object', () => {
    expect(getDiscordConversationName(null)).toBe('unknown-channel');
    expect(getDiscordConversationName('not-an-object')).toBe('unknown-channel');
    expect(getDiscordConversationName(undefined)).toBe('unknown-channel');
  });

  it('treats non-string globalName as missing and uses username', () => {
    const channel = { type: ChannelType.DM, recipient: { globalName: 123, username: 'alice' } };
    expect(getDiscordConversationName(channel)).toBe('alice');
  });

  it('treats non-string username as missing and uses fallback', () => {
    const channel = { type: ChannelType.DM, recipient: { username: 42 } };
    expect(getDiscordConversationName(channel, 'fallback-2')).toBe('fallback-2');
  });
});

describe('getDiscordConversationParticipants', () => {
  it('returns [] when channel is not an object', () => {
    expect(getDiscordConversationParticipants(null, [])).toEqual([]);
    expect(getDiscordConversationParticipants('string', [])).toEqual([]);
  });

  it('collects globalName from each recipient', () => {
    const channel = {
      recipients: [{ globalName: 'Alice' }, { globalName: 'Bob' }],
    };
    expect(getDiscordConversationParticipants(channel, [])).toEqual(['Alice', 'Bob']);
  });

  it('collects username when globalName is missing', () => {
    const channel = { recipients: [{ username: 'alice' }] };
    expect(getDiscordConversationParticipants(channel, [])).toEqual(['alice']);
  });

  it('skips recipients that are not objects', () => {
    const channel = { recipients: [null, 'string', 42, { globalName: 'kept' }] };
    expect(getDiscordConversationParticipants(channel, [])).toEqual(['kept']);
  });

  it('collects authorDisplayName from messages', () => {
    const channel = {};
    const messages = [
      { authorDisplayName: 'Alice' },
      { authorDisplayName: 'Bob' },
    ];
    expect(getDiscordConversationParticipants(channel, messages)).toEqual(['Alice', 'Bob']);
  });

  it('ignores empty and undefined authorDisplayName values', () => {
    const channel = {};
    const messages = [
      { authorDisplayName: 'Alice' },
      { authorDisplayName: '' },
      { authorDisplayName: undefined },
      { authorDisplayName: 'Bob' },
    ];
    expect(getDiscordConversationParticipants(channel, messages)).toEqual(['Alice', 'Bob']);
  });

  it('deduplicates names that appear in both recipients and messages', () => {
    const channel = { recipients: [{ globalName: 'Alice' }] };
    const messages = [{ authorDisplayName: 'Alice' }, { authorDisplayName: 'Bob' }];
    expect(getDiscordConversationParticipants(channel, messages)).toEqual(['Alice', 'Bob']);
  });
});

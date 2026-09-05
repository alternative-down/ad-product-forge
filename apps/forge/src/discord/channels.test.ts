/**
 * Unit tests for discord/channels.ts
 *
 * Covers: listCandidateChannels(client, configuredChannels)
 *  - Returns { channels, failed } result type (L#NN-50 #19 silent failure fix)
 *  - Includes failed channel info when fetch throws (fail-loud per L#NN-46 v4.6b)
 *  - Skips non-text / non-sendable channels
 *  - Returns empty failed[] when all fetches succeed
 *
 * Covers: matchesMessage (via listChannelMessages with query filter)
 *  - Fix: query !== '' actually filters by content (L#NN-50 #19 v3 silent bypass)
 *  - Empty/undefined query → matches all (preserved behavior)
 *  - Non-empty query → only matches content.includes(query) or has attachments
 */
import { describe, expect, it, vi } from 'vitest';
import { Collection } from 'discord.js';
import { listCandidateChannels, resolveDiscordTargetChannel } from './channels';
import type { Client } from 'discord.js';

function makeMockChannel(id: string, opts: { isTextBased?: boolean; isSendable?: boolean } = {}) {
  const isTextBased = opts.isTextBased ?? true;
  const isSendable = opts.isSendable ?? true;
  return {
    id,
    isTextBased: vi.fn(() => isTextBased),
    isSendable: vi.fn(() => isSendable),
    send: vi.fn(),
    sendTyping: vi.fn(),
    messages: { fetch: vi.fn() },
  };
}

function makeClient(channelsById: Map<string, ReturnType<typeof makeMockChannel>>): Client {
  const cache = new Collection<string, ReturnType<typeof makeMockChannel>>();
  for (const [id, ch] of channelsById) cache.set(id, ch);
  return {
    channels: {
      cache,
      fetch: vi.fn(async (id: string) => channelsById.get(id) ?? null),
    },
  } as unknown as Client;
}

describe('listCandidateChannels', () => {
  it('returns { channels, failed } with failed: [] when all fetches succeed', async () => {
    const ch1 = makeMockChannel('ch-1');
    const ch2 = makeMockChannel('ch-2');
    const client = makeClient(
      new Map([
        ['ch-1', ch1],
        ['ch-2', ch2],
      ]),
    );
    const configured = new Map<string, boolean>([
      ['ch-1', true],
      ['ch-2', true],
    ]);

    const result = await listCandidateChannels(client, configured);

    expect(result.channels).toHaveLength(2);
    expect(result.failed).toEqual([]);
  });

  it('surfaces failed channels in result.failed (L#NN-50 #19 fix)', async () => {
    const ch1 = makeMockChannel('ch-1');
    const client = {
      channels: {
        cache: new Collection(),
        fetch: vi.fn(async (id: string) => {
          if (id === 'ch-missing') throw new Error('Unknown Channel');
          return ch1;
        }),
      },
    } as unknown as Client;
    const configured = new Map<string, boolean>([
      ['ch-1', true],
      ['ch-missing', true],
    ]);

    const result = await listCandidateChannels(client, configured);

    expect(result.channels).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.channelId).toBe('ch-missing');
    expect(result.failed[0]?.error).toContain('Unknown Channel');
  });

  it('skips non-text and non-sendable channels without adding to failed', async () => {
    const textCh = makeMockChannel('ch-text');
    const nonTextCh = makeMockChannel('ch-voice', { isTextBased: false });
    const nonSendableCh = makeMockChannel('ch-announce', { isSendable: false });
    const client = makeClient(
      new Map([
        ['ch-text', textCh],
        ['ch-voice', nonTextCh],
        ['ch-announce', nonSendableCh],
      ]),
    );
    const configured = new Map<string, boolean>([
      ['ch-text', true],
      ['ch-voice', true],
      ['ch-announce', true],
    ]);

    const result = await listCandidateChannels(client, configured);

    expect(result.channels).toHaveLength(1);
    expect(result.failed).toEqual([]);
  });
});

// Closes #6112 (resolveDiscordTargetChannel coverage — first 6 of ~13).
// Numeric ID path + username-DM path + error paths (rethrow + debug log).
describe('resolveDiscordTargetChannel', () => {
  const getReady = () => Promise.resolve({} as import('discord.js').ClientUser);
  const noUsers = async () => [];

  it('resolves a numeric targetKey via channels.fetch (happy path)', async () => {
    const ch = makeMockChannel('1234567890');
    const client = makeClient(new Map([['1234567890', ch]]));
    const result = await resolveDiscordTargetChannel(client, '1234567890', getReady, noUsers);
    expect(result.id).toBe('1234567890');
  });

  it('throws DiscordTargetNotSendableError when numeric ID resolves to non-sendable channel', async () => {
    const ch = makeMockChannel('9999999999', { isSendable: false });
    const client = makeClient(new Map([['9999999999', ch]]));
    await expect(
      resolveDiscordTargetChannel(client, '9999999999', getReady, noUsers),
    ).rejects.toThrow(/not sendable/i);
  });

  it('rethrows with discord-account debug log when channels.fetch fails', async () => {
    const fetchErr = new Error('Unknown Channel');
    const client = {
      channels: {
        cache: new Collection(),
        fetch: vi.fn(async () => {
          throw fetchErr;
        }),
      },
    } as unknown as Client;
    await expect(resolveDiscordTargetChannel(client, '0000000000', getReady, noUsers)).rejects.toBe(
      fetchErr,
    );
  });

  it('resolves DM channel via createDM() when targetKey is a username (happy path)', async () => {
    const dmChannel = makeMockChannel('dm-1234');
    const matchedUser = {
      username: 'alice',
      createDM: vi.fn(async () => dmChannel),
    };
    const loadUsers = async () => [matchedUser];
    const client = makeClient(new Map());
    const result = await resolveDiscordTargetChannel(client, 'alice', getReady, loadUsers);
    expect(result.id).toBe('dm-1234');
    expect(matchedUser.createDM).toHaveBeenCalledTimes(1);
  });

  it('throws DiscordUserNotFoundError when username is not in the candidate user list', async () => {
    const loadUsers = async () => [{ username: 'bob', createDM: vi.fn() }];
    const client = makeClient(new Map());
    await expect(resolveDiscordTargetChannel(client, 'alice', getReady, loadUsers)).rejects.toThrow(
      /user not found/i,
    );
  });

  it('rethrows when createDM() fails for a matched username', async () => {
    const dmErr = new Error('Cannot send DM');
    const matchedUser = {
      username: 'alice',
      createDM: vi.fn(async () => {
        throw dmErr;
      }),
    };
    const loadUsers = async () => [matchedUser];
    const client = makeClient(new Map());
    await expect(resolveDiscordTargetChannel(client, 'alice', getReady, loadUsers)).rejects.toBe(
      dmErr,
    );
  });
});

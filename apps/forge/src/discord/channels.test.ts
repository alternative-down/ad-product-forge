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
import {
  listCandidateChannels,
  listChannelMessages,
  resolveDiscordTargetChannel,
} from './channels';
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

// Closes #6112 (listChannelMessages coverage — second half of issue).
// Covers: happy path pagination, empty result, query filter, date filter,
// batch fetch with `before` cursor, attachment-only content fallback.
function makeMockMessage(opts: {
  id: string;
  content: string;
  createdTimestamp: number;
  authorId?: string;
  authorUsername?: string;
  authorGlobalName?: string;
  memberDisplayName?: string;
  attachments?: Array<{
    id: string;
    name?: string;
    url: string;
    contentType?: string;
    size: number;
  }>;
}) {
  return {
    id: opts.id,
    content: opts.content,
    createdTimestamp: opts.createdTimestamp,
    author: {
      id: opts.authorId ?? 'user-1',
      username: opts.authorUsername ?? 'alice',
      globalName: opts.authorGlobalName,
    },
    member: opts.memberDisplayName ? { displayName: opts.memberDisplayName } : undefined,
    attachments: new Collection(
      (opts.attachments ?? []).map((a) => [
        a.id,
        { id: a.id, name: a.name, url: a.url, contentType: a.contentType, size: a.size },
      ]),
    ),
    embeds: [],
  };
}

function makeChannelWithMessages(messages: Array<ReturnType<typeof makeMockMessage>>) {
  // Returns the batch on the first fetch call, then an empty Collection on
  // subsequent calls. This mirrors real Discord pagination: once all messages
  // have been fetched, the next page is empty and the loop breaks. Returning
  // the same batch every call would cause an infinite loop because Collection
  // dedupes by id (collected.size never grows past the first batch).
  let callCount = 0;
  const batch = new Collection(messages.map((m) => [m.id, m]));
  return {
    id: 'ch-test',
    messages: {
      fetch: vi.fn(async () => {
        callCount += 1;
        return callCount > 1 ? new Collection() : batch;
      }),
    },
  } as unknown as Parameters<typeof listChannelMessages>[0]['channel'];
}

describe('listChannelMessages', () => {
  it('returns parsed messages sorted chronologically (limit=2, offset=0)', async () => {
    const channel = makeChannelWithMessages([
      makeMockMessage({ id: 'm3', content: 'third', createdTimestamp: 3000 }),
      makeMockMessage({ id: 'm1', content: 'first', createdTimestamp: 1000 }),
      makeMockMessage({ id: 'm2', content: 'second', createdTimestamp: 2000 }),
    ]);
    // slice semantics: last `limit` messages, skipping last `offset`. With limit=2
    // offset=0 the function returns the LAST 2 messages after sort ASC.
    const result = await listChannelMessages({ channel, limit: 2, offset: 0 });
    expect(result).toHaveLength(2);
    expect(result[0]?.messageId).toBe('m2');
    expect(result[1]?.messageId).toBe('m3');
    expect(result[0]?.content).toBe('second');
  });

  it('returns [] when the channel has no messages', async () => {
    const channel = makeChannelWithMessages([]);
    const result = await listChannelMessages({ channel, limit: 5, offset: 0 });
    expect(result).toEqual([]);
  });

  it('filters by query — only messages whose content includes the substring', async () => {
    const channel = makeChannelWithMessages([
      makeMockMessage({ id: 'a', content: 'hello world', createdTimestamp: 1000 }),
      makeMockMessage({ id: 'b', content: 'goodbye', createdTimestamp: 2000 }),
      makeMockMessage({ id: 'c', content: 'say hello again', createdTimestamp: 3000 }),
    ]);
    const result = await listChannelMessages({ channel, limit: 10, offset: 0, query: 'hello' });
    expect(result.map((m) => m.messageId)).toEqual(['a', 'c']);
  });

  it('filters by dateFrom — drops messages older than the cutoff', async () => {
    const channel = makeChannelWithMessages([
      makeMockMessage({ id: 'old', content: 'old', createdTimestamp: 1000 }),
      makeMockMessage({ id: 'mid', content: 'mid', createdTimestamp: 2000 }),
      makeMockMessage({ id: 'new', content: 'new', createdTimestamp: 3000 }),
    ]);
    const result = await listChannelMessages({
      channel,
      limit: 10,
      offset: 0,
      dateFrom: new Date(2000).toISOString(),
    });
    expect(result.map((m) => m.messageId)).toEqual(['mid', 'new']);
  });

  it('filters by dateTo — drops messages newer than the cutoff', async () => {
    const channel = makeChannelWithMessages([
      makeMockMessage({ id: 'old', content: 'old', createdTimestamp: 1000 }),
      makeMockMessage({ id: 'mid', content: 'mid', createdTimestamp: 2000 }),
      makeMockMessage({ id: 'new', content: 'new', createdTimestamp: 3000 }),
    ]);
    const result = await listChannelMessages({
      channel,
      limit: 10,
      offset: 0,
      dateTo: new Date(2000).toISOString(),
    });
    expect(result.map((m) => m.messageId)).toEqual(['old', 'mid']);
  });

  it('paginates using the `before` cursor when the first batch is smaller than target', async () => {
    const m1 = makeMockMessage({ id: 'm1', content: 'one', createdTimestamp: 1000 });
    const m2 = makeMockMessage({ id: 'm2', content: 'two', createdTimestamp: 2000 });
    const m3 = makeMockMessage({ id: 'm3', content: 'three', createdTimestamp: 3000 });
    const m4 = makeMockMessage({ id: 'm4', content: 'four', createdTimestamp: 4000 });
    // First call returns 1 message, second call returns 2 more. With limit=3
    // offset=0, targetCount=3 — after iter 2 collected.size === 3 so the loop
    // exits. fetch is therefore called 2 times (not 3).
    const firstBatch = new Collection([[m1.id, m1]]);
    const secondBatch = new Collection([
      [m2.id, m2],
      [m3.id, m3],
    ]);
    const channel = {
      id: 'ch-test',
      messages: {
        fetch: vi.fn().mockResolvedValueOnce(firstBatch).mockResolvedValueOnce(secondBatch),
      },
    } as unknown as Parameters<typeof listChannelMessages>[0]['channel'];
    const result = await listChannelMessages({ channel, limit: 3, offset: 0 });
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.messageId)).toEqual(['m1', 'm2', 'm3']);
    expect(channel.messages.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns parsed message including attachments (content="" + attachments)', async () => {
    // Stub global fetch so downloadDiscordAttachments doesn't make a real HTTP call.
    const fakeBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchStub = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => fakeBytes.buffer,
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchStub);
    try {
      const channel = makeChannelWithMessages([
        makeMockMessage({
          id: 'att-1',
          content: '',
          createdTimestamp: 1000,
          attachments: [
            { id: 'att-id-1', name: 'image.png', url: 'https://example.com/img.png', size: 100 },
          ],
        }),
      ]);
      const result = await listChannelMessages({ channel, limit: 5, offset: 0 });
      expect(result).toHaveLength(1);
      // Fix #6983: ?? -> || so empty string triggers the [attachment only]
      // fallback. extractDiscordMessageContent returns "" (never null) for
      // attachment-only messages, so ?? never triggered the fallback before.
      expect(result[0]?.content).toBe('[attachment only]');
      expect(result[0]?.attachments).toHaveLength(1);
      expect(result[0]?.attachments[0]?.name).toBe('image.png');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

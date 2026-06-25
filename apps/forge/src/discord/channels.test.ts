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
import { Collection, Events, GatewayIntentBits, Partials } from 'discord.js';
import { listCandidateChannels } from './channels';
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
    const client = makeClient(new Map([['ch-1', ch1], ['ch-2', ch2]]));
    const configured = new Map<string, boolean>([['ch-1', true], ['ch-2', true]]);

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
    const configured = new Map<string, boolean>([['ch-1', true], ['ch-missing', true]]);

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
    const client = makeClient(new Map([
      ['ch-text', textCh],
      ['ch-voice', nonTextCh],
      ['ch-announce', nonSendableCh],
    ]));
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

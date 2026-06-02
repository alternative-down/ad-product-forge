/**
 * Unit tests for discord/outbound.ts
 *
 * Covers: splitDiscordMessageContent(content)
 *  - Returns [''] for empty / whitespace-only content
 *  - Returns single chunk for content under MAX_MESSAGE_LENGTH
 *  - Splits long content at paragraph boundaries
 *  - Hard-splits paragraphs longer than MAX_MESSAGE_LENGTH at line/space breakpoints
 *  - Uses CHUNK_BREAKPOINT (1500) to prefer natural break points
 *
 * Covers: toDiscordOutboundFiles(attachments)
 *  - Converts Uint8Array data to Buffer
 *  - Preserves name field
 *
 * Covers: sendDiscordChunks(input)
 *  - Sends the first chunk with files, subsequent chunks without files
 *  - Calls rememberOutboundMessage for every chunk with channelId + chunk
 *  - Returns the last sent message
 *  - Re-throws when channel.send fails
 */
import { describe, expect, it, vi } from 'vitest';
import {
  splitDiscordMessageContent,
  toDiscordOutboundFiles,
  sendDiscordChunks,
} from './outbound';
import type { CommunicationFile } from '@forge-runtime/core';
import type { DiscordSendableChannel } from '../discord-types';

const A1100 = 'a'.repeat(1100);
const B1100 = 'b'.repeat(1100);
const C1100 = 'c'.repeat(1100);

describe('splitDiscordMessageContent', () => {
  it('returns [""] for an empty string', () => {
    expect(splitDiscordMessageContent('')).toEqual(['']);
  });

  it('returns [""] for whitespace-only content', () => {
    expect(splitDiscordMessageContent('   \n\n  ')).toEqual(['']);
  });

  it('returns the input unchanged when below MAX_MESSAGE_LENGTH', () => {
    const text = 'a short message';
    expect(splitDiscordMessageContent(text)).toEqual([text]);
  });

  it('combines short paragraphs into a single chunk when they fit', () => {
    const a = 'a'.repeat(100);
    const b = 'b'.repeat(100);
    const text = `${a}\n\n${b}`;
    expect(splitDiscordMessageContent(text)).toEqual([`${a}\n\n${b}`]);
  });

  it('splits at paragraph boundaries when combined length exceeds MAX_MESSAGE_LENGTH', () => {
    const text = `${A1100}\n\n${B1100}`;
    const chunks = splitDiscordMessageContent(text);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe(A1100);
    expect(chunks[1]).toBe(B1100);
  });

  it('hard-splits a single paragraph longer than MAX_MESSAGE_LENGTH at line/space breakpoints', () => {
    const longLine = 'a'.repeat(5_000);
    const chunks = splitDiscordMessageContent(longLine);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2_000);
    }
  });

  it('prefers line-break breakpoints when break is at or after CHUNK_BREAKPOINT (1500)', () => {
    const prefix = 'a'.repeat(1_500);
    const suffix = 'b'.repeat(2_500);
    const text = `${prefix}\n${suffix}`;
    const chunks = splitDiscordMessageContent(text);
    expect(chunks[0]).toBe(prefix);
    const rest = chunks.slice(1).join('');
    expect(rest.length + prefix.length).toBe(4_000);
  });
});

describe('toDiscordOutboundFiles', () => {
  it('converts Uint8Array data to Buffer', () => {
    const attachments: CommunicationFile[] = [
      { name: 'a.bin', data: new Uint8Array([1, 2, 3]) },
    ];
    const out = toDiscordOutboundFiles(attachments);
    expect(out).toHaveLength(1);
    expect(Buffer.isBuffer(out[0].attachment)).toBe(true);
    expect((out[0].attachment as Buffer).toString('hex')).toBe('010203');
    expect(out[0].name).toBe('a.bin');
  });

  it('handles an empty attachment list', () => {
    expect(toDiscordOutboundFiles([])).toEqual([]);
  });
});

describe('sendDiscordChunks', () => {
  function makeChannel() {
    const sent: Array<{ content: string; files?: unknown }> = [];
    const send = vi.fn().mockImplementation(async (payload: string | { content: string; files?: unknown }) => {
      if (typeof payload === 'string') {
        sent.push({ content: payload });
      } else {
        sent.push(payload);
      }
      return { id: `msg-${sent.length}`, channelId: 'ch-1' };
    });
    const channel = { id: 'ch-1', send } as unknown as DiscordSendableChannel;
    return { channel, sent, send };
  }

  it('sends a single chunk when content fits', async () => {
    const { channel, sent, send } = makeChannel();
    const remember = vi.fn();

    const last = await sendDiscordChunks({
      channel,
      content: 'hello',
      attachments: [],
      rememberOutboundMessage: remember,
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(sent[0]).toEqual({ content: 'hello' });
    expect(remember).toHaveBeenCalledWith('ch-1', 'hello');
    expect(last).toEqual({ id: 'msg-1', channelId: 'ch-1' });
  });

  it('attaches files only to the first chunk', async () => {
    const { channel, sent, send } = makeChannel();
    const remember = vi.fn();
    const attachments: CommunicationFile[] = [
      { name: 'a.bin', data: new Uint8Array([1]) },
    ];

    await sendDiscordChunks({
      channel,
      content: `${A1100}\n\n${B1100}`,
      attachments,
      rememberOutboundMessage: remember,
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(sent[0].files).toBeDefined();
    expect((sent[1] as { files?: unknown }).files).toBeUndefined();
    expect(sent[1].content).toBe(B1100);
  });

  it('calls rememberOutboundMessage for every chunk with the channelId and chunk', async () => {
    const { channel, send } = makeChannel();
    const remember = vi.fn();

    await sendDiscordChunks({
      channel,
      content: `${A1100}\n\n${B1100}\n\n${C1100}`,
      attachments: [],
      rememberOutboundMessage: remember,
    });

    expect(send).toHaveBeenCalledTimes(3);
    expect(remember).toHaveBeenCalledTimes(3);
    expect(remember).toHaveBeenNthCalledWith(1, 'ch-1', A1100);
    expect(remember).toHaveBeenNthCalledWith(2, 'ch-1', B1100);
    expect(remember).toHaveBeenNthCalledWith(3, 'ch-1', C1100);
  });

  it('returns the last sent message', async () => {
    const { channel } = makeChannel();

    const last = await sendDiscordChunks({
      channel,
      content: `${A1100}\n\n${B1100}`,
      attachments: [],
      rememberOutboundMessage: vi.fn(),
    });

    expect(last).toEqual({ id: 'msg-2', channelId: 'ch-1' });
  });

  it('re-throws when channel.send fails', async () => {
    const channel = {
      id: 'ch-1',
      send: vi.fn().mockRejectedValue(new Error('discord-down')),
    } as unknown as DiscordSendableChannel;

    await expect(
      sendDiscordChunks({
        channel,
        content: 'hello',
        attachments: [],
        rememberOutboundMessage: vi.fn(),
      }),
    ).rejects.toThrow('discord-down');
  });
});

/**
 * Unit tests for discord/message-parser.ts
 *
 * Covers: extractDiscordMessageContent(message, botUserId?)
 *  - Returns raw content when no botUserId is provided
 *  - Strips <@id> and <@!id> bot mentions
 *  - Trims leading/trailing whitespace
 *  - Concatenates embed title, description, fields, footer, url
 *  - Joins text and embed sections with blank line when both present
 *
 * Covers: downloadDiscordAttachments(message)
 *  - Downloads each attachment and converts to CommunicationFile
 *  - Returns empty Uint8Array + sizeBytes 0 when fetch fails (graceful degradation)
 *  - Throws on HTTP non-2xx via the inner branch (caught and degraded)
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { extractDiscordMessageContent, downloadDiscordAttachments } from './message-parser';

function makeMessage(opts: {
  content?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    fields?: Array<{ name: string; value: string }>;
    footer?: { text?: string };
    url?: string;
  }>;
}) {
  return {
    content: opts.content ?? '',
    embeds: (opts.embeds ?? []).map((e) => ({
      title: e.title,
      description: e.description,
      fields: e.fields ?? [],
      footer: e.footer,
      url: e.url,
    })),
  } as never;
}

describe('extractDiscordMessageContent', () => {
  it('returns raw content when no botUserId is provided', () => {
    const msg = makeMessage({ content: 'hello world' });
    expect(extractDiscordMessageContent(msg)).toBe('hello world');
  });

  it('trims leading and trailing whitespace', () => {
    const msg = makeMessage({ content: '  hello world  \n' });
    expect(extractDiscordMessageContent(msg)).toBe('hello world');
  });

  it('strips <@id> and <@!id> mentions when botUserId is provided', () => {
    const msg = makeMessage({ content: '<@12345> hello <@!12345> world' });
    expect(extractDiscordMessageContent(msg, '12345')).toBe('hello  world');
  });

  it('does not strip mentions of other users', () => {
    const msg = makeMessage({ content: '<@67890> hello <@12345> world' });
    expect(extractDiscordMessageContent(msg, '12345')).toBe('<@67890> hello  world');
  });

  it('returns empty string for content that is only the bot mention', () => {
    const msg = makeMessage({ content: '<@12345>' });
    expect(extractDiscordMessageContent(msg, '12345')).toBe('');
  });

  it('concatenates embed title, description, fields, footer, and url', () => {
    const msg = makeMessage({
      embeds: [
        {
          title: 'T',
          description: 'D',
          fields: [{ name: 'k', value: 'v' }],
          footer: { text: 'F' },
          url: 'https://example.com',
        },
      ],
    });
    const out = extractDiscordMessageContent(msg);
    expect(out).toContain('T');
    expect(out).toContain('D');
    expect(out).toContain('k: v');
    expect(out).toContain('F');
    expect(out).toContain('https://example.com');
  });

  it('joins text and embed sections with a blank line when both are present', () => {
    const msg = makeMessage({
      content: 'text',
      embeds: [{ title: 'embed-title' }],
    });
    const out = extractDiscordMessageContent(msg);
    expect(out).toBe('text\n\nembed-title');
  });

  it('skips empty embed fields', () => {
    const msg = makeMessage({
      embeds: [{ title: 'only-title', description: '   ' }],
    });
    const out = extractDiscordMessageContent(msg);
    expect(out).toBe('only-title');
  });
});

describe('downloadDiscordAttachments', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function makeAttachmentMessage(attachments: Array<{ id: string; url: string; name?: string; contentType?: string; size?: number }>) {
    return {
      attachments: new Map(attachments.map((a) => [a.id, a])),
    } as never;
  }

  it('downloads each attachment and returns CommunicationFile objects', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      return new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200, headers: { 'content-type': 'application/octet-stream' } });
    });

    const message = makeAttachmentMessage([
      { id: 'a1', url: 'https://cdn/a.bin', name: 'a.bin', contentType: 'application/octet-stream', size: 3 },
    ]);

    const out = await downloadDiscordAttachments(message);

    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('a.bin');
    expect(out[0].sizeBytes).toBe(3);
    expect(out[0].contentType).toBe('application/octet-stream');
    expect(new Uint8Array(out[0].data)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('returns an empty Uint8Array + sizeBytes 0 when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network-down'));

    const message = makeAttachmentMessage([
      { id: 'a1', url: 'https://cdn/a.bin', name: 'a.bin', size: 100 },
    ]);

    const out = await downloadDiscordAttachments(message);

    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('a.bin');
    expect(out[0].sizeBytes).toBe(0);
    expect(new Uint8Array(out[0].data)).toEqual(new Uint8Array(0));
  });

  it('returns an empty Uint8Array + sizeBytes 0 when HTTP response is non-2xx', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }));

    const message = makeAttachmentMessage([
      { id: 'a1', url: 'https://cdn/missing.bin', name: 'missing.bin', size: 100 },
    ]);

    const out = await downloadDiscordAttachments(message);

    expect(out).toHaveLength(1);
    expect(out[0].sizeBytes).toBe(0);
  });

  it('falls back to attachment id when name is missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([9]).buffer, { status: 200 }));

    const message = makeAttachmentMessage([
      { id: 'a1', url: 'https://cdn/anon' },
    ]);

    const out = await downloadDiscordAttachments(message);

    expect(out[0].name).toBe('a1');
  });
});

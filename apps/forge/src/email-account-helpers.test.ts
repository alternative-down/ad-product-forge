import { describe, expect, it } from 'vitest';
import type { Email } from 'postal-mime';
import {
  extractEmailBody,
  filterRecentByTtl,
  parseAddressDisplayName,
  parseAddressValue,
  parseFirstRecipient,
  pruneRecentOutboundMessages,
  resolveEmailThreadKey,
  toUint8Array,
} from './email-account-helpers';

describe('toUint8Array', () => {
  it('returns Uint8Array unchanged', () => {
    const input = new Uint8Array([1, 2, 3]);
    expect(toUint8Array(input)).toBe(input);
  });

  it('converts string to Uint8Array', () => {
    const result = toUint8Array('hello');
    expect(result).toEqual(new Uint8Array([104, 101, 108, 108, 111]));
  });

  it('converts ArrayBuffer to Uint8Array', () => {
    const buf = new ArrayBuffer(3);
    new Uint8Array(buf).set([1, 2, 3]);
    const result = toUint8Array(buf);
    expect(Array.from(result)).toEqual([1, 2, 3]);
  });
});

describe('parseAddressValue', () => {
  it('returns lowercased address', () => {
    const addr = { address: 'User@Example.COM', name: 'User' };
    expect(parseAddressValue(addr)).toBe('user@example.com');
  });

  it('returns null when no address property', () => {
    expect(parseAddressValue({ name: 'User' } as any)).toBeNull();
  });

  it('returns null when address is undefined', () => {
    expect(parseAddressValue(undefined)).toBeNull();
  });
});

describe('parseAddressDisplayName', () => {
  it('returns name when present', () => {
    const addr = { address: 'a@b.com', name: 'Alice' };
    expect(parseAddressDisplayName(addr)).toBe('Alice');
  });

  it('falls back to address when name is missing', () => {
    const addr = { address: 'a@b.com' };
    expect(parseAddressDisplayName(addr as any)).toBe('a@b.com');
  });

  it('returns null for undefined', () => {
    expect(parseAddressDisplayName(undefined)).toBeNull();
  });
});

describe('parseFirstRecipient', () => {
  it('returns first valid recipient', () => {
    const addrs = [
      { address: 'alice@example.com', name: 'Alice' },
      { address: 'bob@example.com', name: 'Bob' },
    ];
    expect(parseFirstRecipient(addrs as any)).toEqual({
      address: 'alice@example.com',
      displayName: 'Alice',
    });
  });

  it('skips entries without address', () => {
    const addrs = [{ name: 'No Address' }, { address: 'bob@example.com', name: 'Bob' }];
    expect(parseFirstRecipient(addrs as any)).toEqual({
      address: 'bob@example.com',
      displayName: 'Bob',
    });
  });

  it('returns null for empty array', () => {
    expect(parseFirstRecipient([])).toBeNull();
    expect(parseFirstRecipient(undefined as any)).toBeNull();
  });
});

describe('filterRecentByTtl', () => {
  const NOW = 1_700_000_000_000;

  it('keeps messages within TTL', () => {
    const messages = [
      { createdAt: new Date(NOW - 1_000).toISOString() },
      { createdAt: new Date(NOW - 10_000).toISOString() },
    ];
    expect(filterRecentByTtl(messages, 60_000, NOW)).toHaveLength(2);
  });

  it('drops messages older than TTL', () => {
    const messages = [
      { createdAt: new Date(NOW - 120_000).toISOString() },
      { createdAt: new Date(NOW - 5_000).toISOString() },
    ];
    const result = filterRecentByTtl(messages, 60_000, NOW);
    expect(result).toHaveLength(1);
  });

  it('accepts numeric createdAt (discord shape)', () => {
    const messages = [
      { createdAt: NOW - 1_000 }, // within TTL
      { createdAt: NOW - 120_000 }, // expired
    ];
    const result = filterRecentByTtl(messages, 60_000, NOW);
    expect(result).toHaveLength(1);
  });
});

describe('pruneRecentOutboundMessages', () => {
  const NOW = 1_700_000_000_000;
  const TTL = 60_000;

  it('removes entries where all messages are expired', () => {
    const map = new Map<string, Array<{ createdAt: string; content: string }>>();
    map.set('a', [{ createdAt: new Date(NOW - TTL * 2).toISOString(), content: 'old' }]);
    pruneRecentOutboundMessages(map as any, TTL, NOW);
    expect(map.has('a')).toBe(false);
  });

  it('keeps entries with at least one non-expired message', () => {
    const map = new Map<string, Array<{ createdAt: string; content: string }>>();
    map.set('a', [
      { createdAt: new Date(NOW - TTL * 2).toISOString(), content: 'old' },
      { createdAt: new Date(NOW - 1_000).toISOString(), content: 'new' },
    ]);
    pruneRecentOutboundMessages(map as any, TTL, NOW);
    expect(map.get('a')).toHaveLength(1);
    expect(map.get('a')?.[0].content).toBe('new');
  });
});

describe('resolveEmailThreadKey', () => {
  function makeEmail(overrides: Partial<Email> = {}): Email {
    return { messageId: 'm1', ...overrides } as Email;
  }

  it('returns messageId when present', () => {
    expect(resolveEmailThreadKey(makeEmail({ messageId: 'msg-1' }))).toBe('msg-1');
  });

  it('returns inReplyTo[0] when messageId is absent', () => {
    expect(
      resolveEmailThreadKey(
        makeEmail({ messageId: undefined, inReplyTo: ['reply-1'] as never }),
      ),
    ).toBe('reply-1');
  });

  it('returns references[0] when messageId and inReplyTo are absent', () => {
    expect(
      resolveEmailThreadKey(
        makeEmail({ messageId: undefined, inReplyTo: [] as never, references: ['ref-1'] as never }),
      ),
    ).toBe('ref-1');
  });

  it('returns deterministic orphan key based on subject (regression for #5500)', () => {
    const email1 = makeEmail({
      messageId: undefined,
      inReplyTo: [] as never,
      references: [] as never,
      subject: 'Test Subject',
    });
    const email2 = makeEmail({
      messageId: undefined,
      inReplyTo: [] as never,
      references: [] as never,
      subject: 'Test Subject',
    });
    const key1 = resolveEmailThreadKey(email1);
    const key2 = resolveEmailThreadKey(email2);
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^orphan-/);
    expect(key1).not.toMatch(/^\d+$/);
  });

  it('returns distinct orphan keys for different subjects', () => {
    const emailA = makeEmail({
      messageId: undefined,
      inReplyTo: [] as never,
      references: [] as never,
      subject: 'Subject A',
    });
    const emailB = makeEmail({
      messageId: undefined,
      inReplyTo: [] as never,
      references: [] as never,
      subject: 'Subject B',
    });
    expect(resolveEmailThreadKey(emailA)).not.toBe(resolveEmailThreadKey(emailB));
  });
});

describe('extractEmailBody', () => {
  function makeEmail(text: string): Email {
    return { text } as Email;
  }

  it('preserves markdown headers (regression for #5501)', () => {
    const email = makeEmail('# Header\n\nbody text');
    expect(extractEmailBody(email)).toContain('# Header');
  });

  it('preserves list items (regression for #5501)', () => {
    const email = makeEmail('* Item one\n* Item two');
    expect(extractEmailBody(email)).toContain('* Item one');
    expect(extractEmailBody(email)).toContain('* Item two');
  });

  it('preserves horizontal rules (regression for #5501)', () => {
    const email = makeEmail('above\n---\nbelow');
    expect(extractEmailBody(email)).toContain('---');
  });

  it('preserves underscore emphasis (regression for #5501)', () => {
    const email = makeEmail('_emphasis_ here');
    expect(extractEmailBody(email)).toContain('_emphasis_');
  });

  it('drops pure quote lines (lines that are ONLY > characters)', () => {
    // Lines that are PURELY '>' chars (no text) are quote markers, not content
    const email = makeEmail('real text\n>\n>>\n> >\nmore real text');
    const result = extractEmailBody(email);
    expect(result).toContain('real text');
    expect(result).toContain('more real text');
    // The 3 pure-quote lines should be dropped (no '>' in output)
    expect(result).not.toContain('>');
  });

  it('preserves quoted text lines (text after > is content)', () => {
    // Lines with TEXT after the '>' are still content (not pure markers)
    const email = makeEmail('hello\n> this is a quote');
    const result = extractEmailBody(email);
    expect(result).toContain('hello');
    expect(result).toContain('this is a quote');
  });

  it('stops at signature separator "--"', () => {
    const email = makeEmail('body content\n--\nsignature line');
    const result = extractEmailBody(email);
    expect(result).toContain('body content');
    expect(result).not.toContain('signature line');
  });
});

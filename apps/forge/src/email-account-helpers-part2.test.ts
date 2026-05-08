/**
 * Expansion tests for email-account-helpers.ts — covers uncovered functions.
 * Functions already tested: toUint8Array, parseAddressValue, parseAddressDisplayName, parseFirstRecipient.
 * Functions tested here: toCommunicationAttachments, pruneRecentOutboundMessages, parseFilterDate,
 * resolveConversationParticipant, resolveEmailThreadKey, resolveCreatedAt, extractEmailBody, toReplySubject.
 */
import { describe, expect, it } from 'vitest';
import type { Email } from 'postal-mime';
import type { CommunicationFile } from '@forge-runtime/core';
import {
  toCommunicationAttachments,
  pruneRecentOutboundMessages,
  parseFilterDate,
  resolveConversationParticipant,
  resolveEmailThreadKey,
  resolveCreatedAt,
  extractEmailBody,
  toReplySubject,
} from './email-account-helpers';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal stub message for pruneRecentOutboundMessages */
function makeMsg(id: string, createdAt: string) {
  return {
    messageId: id,
    content: 'test',
    attachments: [] as CommunicationFile[],
    createdAt,
    unread: false,
    authorId: 'a',
    authorDisplayName: 'A',
  };
}

// ─── toCommunicationAttachments ───────────────────────────────────────────────

describe('toCommunicationAttachments', () => {
  function makeEmail(
    attachments?: Array<{
      filename?: string;
      mimeType?: string;
      content: ArrayBuffer | Uint8Array | string;
    }>,
  ): Email {
    return { attachments } as Email;
  }

  it('returns empty array when no attachments', () => {
    expect(toCommunicationAttachments(makeEmail(), 'msg-1')).toEqual([]);
  });

  it('maps filename, mimeType, and sizeBytes correctly', () => {
    const email = makeEmail([
      { filename: 'doc.pdf', mimeType: 'application/pdf', content: 'PDF content' as unknown as ArrayBuffer },
    ]);
    const result = toCommunicationAttachments(email, 'msg-1');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('doc.pdf');
    expect(result[0].contentType).toBe('application/pdf');
    expect(result[0].sizeBytes).toBeGreaterThan(0);
  });

  it('generates name from index when filename missing', () => {
    const email = makeEmail([{ mimeType: 'image/png', content: new Uint8Array([0x89, 0x50, 0x4e]) }]);
    expect(toCommunicationAttachments(email, 'msg-abc')[0].name).toBe('msg-abc-0');
  });

  it('handles multiple attachments with sequential indices', () => {
    const email = makeEmail([
      { filename: 'a.txt', content: 'a' as unknown as ArrayBuffer },
      { filename: 'b.txt', content: 'b' as unknown as ArrayBuffer },
    ]);
    const result = toCommunicationAttachments(email, 'msg-1');
    expect(result[0].name).toBe('a.txt');
    expect(result[1].name).toBe('b.txt');
  });

  it('sets sizeBytes from converted content byteLength', () => {
    const email = makeEmail([{ content: 'hello' as unknown as ArrayBuffer }]);
    expect(toCommunicationAttachments(email, 'msg-1')[0].sizeBytes).toBe(5);
  });
});

// ─── pruneRecentOutboundMessages ─────────────────────────────────────────────

describe('pruneRecentOutboundMessages', () => {
  it('does nothing when all messages are within TTL', () => {
    const map = new Map([['k1', [makeMsg('m1', new Date().toISOString())]]]);
    pruneRecentOutboundMessages(map, 60_000);
    expect(map.has('k1')).toBe(true);
  });

  it('deletes key when all messages are outside TTL', () => {
    const old = new Date(Date.now() - 120_000).toISOString();
    const map = new Map([['k1', [makeMsg('m1', old)]]]);
    pruneRecentOutboundMessages(map, 60_000);
    expect(map.has('k1')).toBe(false);
  });

  it('keeps key but filters messages when some are outside TTL', () => {
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 120_000).toISOString();
    const map = new Map([['k1', [makeMsg('m1', old), makeMsg('m2', now)]]]);
    pruneRecentOutboundMessages(map, 60_000);
    expect(map.get('k1')).toHaveLength(1);
    expect(map.get('k1')![0].messageId).toBe('m2');
  });

  it('handles empty map without error', () => {
    const map = new Map();
    pruneRecentOutboundMessages(map, 60_000);
    expect(map.size).toBe(0);
  });
});

// ─── parseFilterDate ─────────────────────────────────────────────────────────

describe('parseFilterDate', () => {
  it('parses ISO date string to timestamp', () => {
    const ts = Date.parse('2025-01-01T00:00:00.000Z');
    expect(parseFilterDate('2025-01-01T00:00:00.000Z', 'startDate')).toBe(ts);
  });

  it('parses date-only string', () => {
    const ts = Date.parse('2025-06-15');
    expect(parseFilterDate('2025-06-15', 'startDate')).toBe(ts);
  });

  it('returns null when value is undefined', () => {
    expect(parseFilterDate(undefined, 'startDate')).toBeNull();
  });

  it('throws when date string is invalid', () => {
    expect(() => parseFilterDate('not-a-date', 'startDate')).toThrow(/Invalid startDate: not-a-date/);
  });

  it('includes fieldName in error message', () => {
    expect(() => parseFilterDate('garbage', 'myField')).toThrow(/Invalid myField: garbage/);
  });
});

// ─── resolveConversationParticipant ───────────────────────────────────────────

describe('resolveConversationParticipant', () => {
  function makeEmail(from?: object, to?: Array<object>): Email {
    return { from: from as Email['from'], to: to as Email['to'] } as Email;
  }

  it('returns from address when different from selfEmail', () => {
    const email = makeEmail({ address: 'alice@example.com', name: 'Alice' });
    const result = resolveConversationParticipant(email, 'me@example.com');
    expect(result).toEqual({
      targetKey: 'alice@example.com',
      authorId: 'alice@example.com',
      authorDisplayName: 'Alice',
    });
  });

  it('uses display name when from address is available', () => {
    const email = makeEmail({ address: 'bob@test.com', name: 'Bob Smith' });
    expect(resolveConversationParticipant(email, 'me@test.com')?.authorDisplayName).toBe('Bob Smith');
  });

  it('falls back to address when name is missing', () => {
    const email = makeEmail({ address: 'charlie@test.com' });
    expect(resolveConversationParticipant(email, 'me@test.com')?.authorDisplayName).toBe('charlie@test.com');
  });

  it('returns null when from equals selfEmail and no recipient', () => {
    const email = makeEmail({ address: 'me@example.com', name: 'Me' });
    expect(resolveConversationParticipant(email, 'me@example.com')).toBeNull();
  });

  it('returns recipient when from equals selfEmail', () => {
    const email = makeEmail(
      { address: 'me@example.com', name: 'Me' },
      [{ address: 'alice@example.com', name: 'Alice' }],
    );
    const result = resolveConversationParticipant(email, 'me@example.com');
    expect(result).toEqual({
      targetKey: 'alice@example.com',
      authorId: 'me@example.com',
      authorDisplayName: 'me@example.com',
    });
  });

  it('returns null when no from address and no recipient', () => {
    const email = makeEmail(undefined, []);
    expect(resolveConversationParticipant(email, 'me@example.com')).toBeNull();
  });
});

// ─── resolveEmailThreadKey ─────────────────────────────────────────────────

describe('resolveEmailThreadKey', () => {
  function makeEmail(fields: Partial<Email>): Email {
    return fields as Email;
  }

  it('prefers inReplyTo', () => {
    const email = makeEmail({ inReplyTo: ['msg-ref-123'], messageId: 'msg-456' });
    expect(resolveEmailThreadKey(email)).toBe('msg-ref-123');
  });

  it('falls back to references when inReplyTo is empty array', () => {
    const email = makeEmail({ inReplyTo: [], references: ['ref-abc'] });
    expect(resolveEmailThreadKey(email)).toBe('ref-abc');
  });

  it('falls back to messageId when neither inReplyTo nor references', () => {
    const email = makeEmail({ messageId: 'msg-xyz' });
    expect(resolveEmailThreadKey(email)).toBe('msg-xyz');
  });

  it('returns orphan prefix with timestamp when nothing available', () => {
    const email = makeEmail({});
    const result = resolveEmailThreadKey(email);
    expect(result).toMatch(/^orphan-\d+$/);
  });

  it('handles undefined entries in inReplyTo array', () => {
    const email = makeEmail({ inReplyTo: [undefined as unknown as string] });
    const result = resolveEmailThreadKey(email);
    expect(result).toMatch(/^orphan-\d+$/);
  });
});

// ─── resolveCreatedAt ───────────────────────────────────────────────────────

describe('resolveCreatedAt', () => {
  it('returns string date unchanged', () => {
    const email = { date: '2025-03-01T12:00:00.000Z' } as Email;
    expect(resolveCreatedAt(email)).toBe('2025-03-01T12:00:00.000Z');
  });

  it('converts Date object to ISO string', () => {
    const email = { date: new Date('2025-03-01T12:00:00.000Z') } as Email;
    expect(resolveCreatedAt(email)).toBe('2025-03-01T12:00:00.000Z');
  });

  it('returns current time when date is missing', () => {
    const before = Date.now();
    const email = {} as Email;
    const result = resolveCreatedAt(email);
    const after = Date.now();
    const ts = Date.parse(result);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ─── extractEmailBody ─────────────────────────────────────────────────────

describe('extractEmailBody', () => {
  function makeEmail(text?: string, html?: string): Email {
    return { text, html } as Email;
  }

  it('returns text when available', () => {
    expect(extractEmailBody(makeEmail('Hello world'))).toBe('Hello world');
  });

  it('strips HTML tags when no text', () => {
    expect(extractEmailBody(makeEmail(undefined, '<p>Hello <b>world</b></p>'))).toBe('Hello world');
  });

  it('returns [no content] when both empty', () => {
    expect(extractEmailBody(makeEmail(undefined, undefined))).toBe('[no content]');
  });

  it('returns [no content] when text is only whitespace', () => {
    expect(extractEmailBody(makeEmail('   '))).toBe('[no content]');
  });

  it('strips signature separator (double dash)', () => {
    const email = makeEmail('Hello\n-- \nBest regards');
    expect(extractEmailBody(email)).toBe('Hello');
  });

  it('strips lines that are only quote marker characters', () => {
    // Lines with text are kept; only pure marker lines are stripped
    const email = makeEmail('Hello\n>\n>\n*\nreal text');
    expect(extractEmailBody(email)).toBe('Hello\nreal text');
  });

  it('normalizes CRLF to LF', () => {
    expect(extractEmailBody(makeEmail('Line1\r\nLine2\rLine3'))).toBe('Line1\nLine2\nLine3');
  });
});

// ─── toReplySubject ─────────────────────────────────────────────────────────

describe('toReplySubject', () => {
  it('prepends Re: when not present', () => {
    expect(toReplySubject('Hello world')).toBe('Re: Hello world');
  });

  it('leaves subject unchanged when already starts with re:', () => {
    expect(toReplySubject('Re: Hello world')).toBe('Re: Hello world');
  });

  it('leaves subject unchanged when already starts with RE: (uppercase)', () => {
    expect(toReplySubject('RE: Hello world')).toBe('RE: Hello world');
  });

  it('trims whitespace', () => {
    expect(toReplySubject('  Hello  ')).toBe('Re: Hello');
  });

  it('handles empty-like subject', () => {
    expect(toReplySubject('  ')).toBe('Re: ');
  });
});
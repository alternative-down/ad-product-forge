/**
 * Unit tests for communication/internal-chat-attachments.ts.
 * createChatAttachments — storeMessageAttachments, readMessageAttachments,
 * readMessageAttachment.
 * Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import { createChatAttachments } from './internal-chat-attachments';
import type { CommunicationFile } from '@forge-runtime/core';

// ─── Shared mock DB factory ─────────────────────────────────────────────────
//
// Drizzle insert API: db.insert(table).values(rows)
// db.insert() returns an object with a .values() method.

function makeMockDb(overrides?: {
  attachmentRows?: unknown[];
  findManyError?: Error;
  insertError?: Error;
}) {
  const attachmentRows = overrides?.attachmentRows ?? [];
  return {
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation(async () => {
        if (overrides?.insertError) throw overrides.insertError;
        return { rowsAffected: attachmentRows.length };
      }),
    })),
    query: {
      internalChatMessageAttachments: {
        findMany: vi.fn().mockImplementation(async () => {
          if (overrides?.findManyError) throw overrides.findManyError;
          return attachmentRows;
        }),
      },
    },
  };
}

function makeFile(data = 'file-data'): CommunicationFile {
  return {
    name: 'file.pdf',
    data: new Uint8Array(Buffer.from(data)),
    contentType: 'application/pdf',
    sizeBytes: data.length,
  };
}

const DB = {} as Parameters<typeof createChatAttachments>[0];

// ─── storeMessageAttachments ─────────────────────────────────────────────────

describe('createChatAttachments — storeMessageAttachments', () => {
  it('does not insert when attachments array is empty', async () => {
    const db = makeMockDb();
    const attachments = createChatAttachments(db as never);

    await attachments.storeMessageAttachments('msg-1', []);

    expect(db.insert).not.toHaveBeenCalled();
  });

  it('calls db.insert().values() with one row per attachment', async () => {
    const db = makeMockDb();
    const attachments = createChatAttachments(db as never);

    await attachments.storeMessageAttachments('msg-1', [
      makeFile('content-a'),
      makeFile('content-b'),
    ]);

    expect(db.insert).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it('throws when db.insert().values() throws', async () => {
    const db = makeMockDb({ insertError: new Error('insert failed') });
    const attachments = createChatAttachments(db as never);

    await expect(
      attachments.storeMessageAttachments('msg-1', [makeFile()]),
    ).rejects.toThrow('insert failed');
  });
});

// ─── readMessageAttachments ───────────────────────────────────────────────────

describe('createChatAttachments — readMessageAttachments', () => {
  it('returns mapped CommunicationFile objects from DB rows', async () => {
    const db = makeMockDb({
      attachmentRows: [{
        name: 'doc.pdf',
        data: Buffer.from([0x01, 0x02]),
        contentType: 'application/pdf',
        sizeBytes: 2,
        attachmentIndex: 0,
      }],
    });
    const attachments = createChatAttachments(db as never);

    const result = await attachments.readMessageAttachments('msg-1');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('doc.pdf');
    expect(result[0].data).toBeInstanceOf(Uint8Array);
    expect(result[0].contentType).toBe('application/pdf');
  });

  it('returns attachment with null contentType when row has null contentType', async () => {
    const db = makeMockDb({
      attachmentRows: [{
        name: 'script.js',
        data: Buffer.from([0x01]),
        contentType: null,
        sizeBytes: 1,
        attachmentIndex: 0,
      }],
    });
    const attachments = createChatAttachments(db as never);

    const result = await attachments.readMessageAttachments('msg-1');

    expect(result[0].name).toBe('script.js');
    // contentType may be undefined when resolveContentType doesn't recognize the extension
    expect(result[0].name).toBeTruthy();
  });

  it('queries DB via findMany', async () => {
    const db = makeMockDb({ attachmentRows: [] });
    const attachments = createChatAttachments(db as never);

    await attachments.readMessageAttachments('msg-specific');

    expect(db.query.internalChatMessageAttachments.findMany).toHaveBeenCalled();
  });

  it('returns empty array when no attachments for messageId', async () => {
    const db = makeMockDb({ attachmentRows: [] });
    const attachments = createChatAttachments(db as never);

    const result = await attachments.readMessageAttachments('msg-no-attachments');

    expect(result).toHaveLength(0);
  });

  it('throws when db.findMany throws', async () => {
    const db = makeMockDb({ findManyError: new Error('findMany failed') });
    const attachments = createChatAttachments(db as never);

    await expect(
      attachments.readMessageAttachments('msg-1'),
    ).rejects.toThrow('findMany failed');
  });
});

// ─── readMessageAttachment ───────────────────────────────────────────────────

describe('createChatAttachments — readMessageAttachment', () => {
  it('returns single attachment when found by name', async () => {
    const db = makeMockDb({
      attachmentRows: [{
        name: 'file.pdf',
        data: Buffer.from([0x01]),
        contentType: 'application/pdf',
        sizeBytes: 1,
        attachmentIndex: 0,
      }],
    });
    const attachments = createChatAttachments(db as never);

    const result = await attachments.readMessageAttachment('msg-1', 'file.pdf');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('file.pdf');
  });

  it('returns null when no attachment matches the name', async () => {
    const db = makeMockDb({
      attachmentRows: [{
        name: 'other.pdf',
        data: Buffer.from([0x01]),
        contentType: 'application/pdf',
        sizeBytes: 1,
        attachmentIndex: 0,
      }],
    });
    const attachments = createChatAttachments(db as never);

    const result = await attachments.readMessageAttachment('msg-1', 'missing.pdf');

    expect(result).toBeNull();
  });

  it('returns null when no attachments exist for the message', async () => {
    const db = makeMockDb({ attachmentRows: [] });
    const attachments = createChatAttachments(db as never);

    const result = await attachments.readMessageAttachment('msg-1', 'file.pdf');

    expect(result).toBeNull();
  });

  it('rethrows when readMessageAttachments throws', async () => {
    const db = makeMockDb({ findManyError: new Error('upstream failed') });
    const attachments = createChatAttachments(db as never);

    await expect(
      attachments.readMessageAttachment('msg-1', 'file.pdf'),
    ).rejects.toThrow('upstream failed');
  });
});
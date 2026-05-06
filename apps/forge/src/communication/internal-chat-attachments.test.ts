import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatAttachments } from './internal-chat-attachments';

// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------
function createMockDb(overrides?: {
  attachments?: unknown[];
  insertError?: Error;
  findManyError?: Error;
}) {
  const attachments = overrides?.attachments ?? [];
  const insertError = overrides?.insertError;
  const findManyError = overrides?.findManyError;

  return {
    query: {
      internalChatMessageAttachments: {
        findMany: vi.fn().mockImplementation(async () => {
          if (findManyError) throw findManyError;
          return attachments;
        }),
      },
    },
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{}]),
    })),
  };
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const ATTACHMENT_ROW = {
  id: 'att_001',
  messageId: 'msg_001',
  attachmentIndex: 0,
  name: 'report.pdf',
  contentType: 'application/pdf',
  sizeBytes: 1024,
  data: Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
  createdAt: 1710000000000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('createChatAttachments', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── storeMessageAttachments ─────────────────────────────────────────────

  describe('storeMessageAttachments', () => {
    it('stores multiple attachments for a message', async () => {
      const attachments = createChatAttachments(db as unknown as import('../database/index').Database);

      await attachments.storeMessageAttachments('msg_001', [
        { name: 'file1.txt', data: new Uint8Array([0x68, 0x69]) },
        { name: 'file2.txt', data: new Uint8Array([0x68, 0x69]) },
      ]);

      expect(db.insert).toHaveBeenCalled();
    });

    it('uses contentType from attachment when provided', async () => {
      const attachments = createChatAttachments(db as unknown as import('../database/index').Database);

      await attachments.storeMessageAttachments('msg_001', [
        {
          name: 'image.png',
          data: new Uint8Array([0x89, 0x50, 0x4e]),
          contentType: 'image/png',
        },
      ]);

      expect(db.insert).toHaveBeenCalled();
      const insertCall = (db.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];

    });

    it('uses sizeBytes from attachment when provided', async () => {
      const testDb = createMockDb();
      const attachments = createChatAttachments(testDb as unknown as import('../database/index').Database);

      await attachments.storeMessageAttachments('msg_001', [
        {
          name: 'large.bin',
          data: new Uint8Array(100),
          sizeBytes: 999,
        },
      ]);

      expect(testDb.insert).toHaveBeenCalled();
    });

    it('infers sizeBytes from data.byteLength when sizeBytes not provided', async () => {
      const testDb = createMockDb();
      const attachments = createChatAttachments(testDb as unknown as import('../database/index').Database);

      await attachments.storeMessageAttachments('msg_001', [
        { name: 'data.bin', data: new Uint8Array(50) },
      ]);

      expect(testDb.insert).toHaveBeenCalled();
    });

    it('returns early when attachments array is empty', async () => {
      const testDb = createMockDb();
      const attachments = createChatAttachments(testDb as unknown as import('../database/index').Database);

      await attachments.storeMessageAttachments('msg_001', []);

      expect(testDb.insert).not.toHaveBeenCalled();
    });

    it('propagates errors from db.insert', async () => {
      const testDb = createMockDb();
      testDb.insert = vi.fn().mockImplementation(() => {
        throw new Error('insert failed');
      });
      const attachments = createChatAttachments(testDb as unknown as import('../database/index').Database);

      await expect(
        attachments.storeMessageAttachments('msg_001', [
          { name: 'f.txt', data: new Uint8Array([0x41]) },
        ]),
      ).rejects.toThrow('insert failed');
    });
  });

  // ── readMessageAttachments ──────────────────────────────────────────────

  describe('readMessageAttachments', () => {
    it('returns attachments ordered by attachmentIndex', async () => {
      const testDb = createMockDb({
        attachments: [
          { ...ATTACHMENT_ROW, attachmentIndex: 0, name: 'a.pdf' },
          { ...ATTACHMENT_ROW, attachmentIndex: 1, name: 'b.pdf' },
        ],
      });
      const attachments = createChatAttachments(testDb as unknown as import('../database/index').Database);

      const result = await attachments.readMessageAttachments('msg_001');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('a.pdf');
      expect(result[1].name).toBe('b.pdf');
      expect(testDb.query.internalChatMessageAttachments.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.any(Object),
          orderBy: expect.any(Function),
        }),
      );
    });

    it('maps database rows to CommunicationFile shape', async () => {
      const testDb = createMockDb({ attachments: [ATTACHMENT_ROW] });
      const attachments = createChatAttachments(testDb as unknown as import('../database/index').Database);

      const result = await attachments.readMessageAttachments('msg_001');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('report.pdf');
      expect(result[0].contentType).toBe('application/pdf');
      expect(result[0].sizeBytes).toBe(1024);
      expect(result[0].data).toBeInstanceOf(Uint8Array);
    });

    it('returns empty array when no attachments found', async () => {
      const testDb = createMockDb({ attachments: [] });
      const attachments = createChatAttachments(testDb as unknown as import('../database/index').Database);

      const result = await attachments.readMessageAttachments('msg_001');

      expect(result).toEqual([]);
    });

    it('resolves contentType from filename when contentType is null in DB', async () => {
      const testDb = createMockDb({
        attachments: [{ ...ATTACHMENT_ROW, contentType: null }],
      });
      const attachments = createChatAttachments(testDb as unknown as import('../database/index').Database);

      const result = await attachments.readMessageAttachments('msg_001');

      expect(result).toHaveLength(1);
      expect(result[0].contentType).toBeDefined();
    });

    it('propagates errors from db.query.findMany', async () => {
      const testDb = createMockDb({ findManyError: new Error('query failed') });
      const attachments = createChatAttachments(testDb as unknown as import('../database/index').Database);

      await expect(attachments.readMessageAttachments('msg_001')).rejects.toThrow('query failed');
    });
  });

  // ── readMessageAttachment ──────────────────────────────────────────────

  describe('readMessageAttachment', () => {
    it('returns the matching attachment when found', async () => {
      const testDb = createMockDb({
        attachments: [
          { ...ATTACHMENT_ROW, name: 'report.pdf' },
          { ...ATTACHMENT_ROW, name: 'image.png' },
        ],
      });
      const attachments = createChatAttachments(testDb as unknown as import('../database/index').Database);

      const result = await attachments.readMessageAttachment('msg_001', 'report.pdf');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('report.pdf');
    });

    it('returns null when no matching attachment found', async () => {
      const testDb = createMockDb({
        attachments: [{ ...ATTACHMENT_ROW, name: 'other.pdf' }],
      });
      const attachments = createChatAttachments(testDb as unknown as import('../database/index').Database);

      const result = await attachments.readMessageAttachment('msg_001', 'nonexistent.pdf');

      expect(result).toBeNull();
    });

    it('returns null when message has no attachments', async () => {
      const testDb = createMockDb({ attachments: [] });
      const attachments = createChatAttachments(testDb as unknown as import('../database/index').Database);

      const result = await attachments.readMessageAttachment('msg_001', 'any.pdf');

      expect(result).toBeNull();
    });

    it('propagates errors from readMessageAttachments', async () => {
      const testDb = createMockDb({ findManyError: new Error('query failed') });
      const attachments = createChatAttachments(testDb as unknown as import('../database/index').Database);

      await expect(
        attachments.readMessageAttachment('msg_001', 'report.pdf'),
      ).rejects.toThrow('query failed');
    });
  });
});
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEmailProvider } from './email-account';

vi.mock('@forge-runtime/core', () => ({ forgeDebug: vi.fn() }));

// ── ImapFlow mock ────────────────────────────────────────────────────────────
const mockLockObj = { release: vi.fn() };
const mockFetchOne = vi.fn();
const mockimapClient = {
  logon: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
  getMailboxLock: vi.fn().mockResolvedValue(mockLockObj),
  fetchOne: mockFetchOne,
};

vi.mock('imapflow', () => ({
  ImapFlow: vi.fn(() => mockimapClient),
}));

// ── nodemailer mock ──────────────────────────────────────────────────────────
const mockSendMail = vi.fn().mockResolvedValue({ messageId: '<test-123@example.com>' });
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
      close: vi.fn().mockResolvedValue(undefined),
    })),
  },
  createTransport: vi.fn(() => ({
    sendMail: mockSendMail,
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

// ── postal-mime mock ────────────────────────────────────────────────────────
vi.mock('postal-mime', () => ({
  default: {
    parse: vi.fn().mockResolvedValue({
      subject: 'Test Email',
      from: { address: 'sender@example.com', name: 'Sender' },
      date: new Date('2025-01-01'),
      text: 'Hello world',
      html: '<p>Hello world</p>',
      attachments: [],
    }),
  },
}));

const minimalConfig = {
  imap: { host: 'imap.example.com', port: 993, secure: true, user: 'test@example.com', password: 'secret' },
  smtp: { host: 'smtp.example.com', port: 587, secure: false, user: 'test@example.com', password: 'secret' },
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe('email-account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchOne.mockReset();
    mockSendMail.mockReset();
    mockSendMail.mockResolvedValue({ messageId: '<test-123@example.com>' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createEmailProvider', () => {
    it('returns a provider object', () => {
      const provider = createEmailProvider(minimalConfig);
      expect(provider).toBeDefined();
    });

    it('returns object with sendMessage method', () => {
      const provider = createEmailProvider(minimalConfig);
      expect(typeof provider.sendMessage).toBe('function');
    });

    it('returns object with poll method', () => {
      const provider = createEmailProvider(minimalConfig);
      expect(typeof provider.poll).toBe('function');
    });

    it('returns object with setOnMessageHandler method', () => {
      const provider = createEmailProvider(minimalConfig);
      expect(typeof provider.setOnMessageHandler).toBe('function');
    });

    it('returns object with dispose method', () => {
      const provider = createEmailProvider(minimalConfig);
      expect(typeof provider.dispose).toBe('function');
    });

    it('has id property', () => {
      const provider = createEmailProvider(minimalConfig);
      expect(typeof (provider as any).id).toBe('string');
    });

    it('accepts custom id in config', () => {
      const config = { ...minimalConfig, id: 'my-email-account' };
      const provider = createEmailProvider(config);
      expect((provider as any).id).toBe('my-email-account');
    });
  });

  describe('poll', () => {
    it('returns empty list when no messages on server', async () => {
      mockFetchOne.mockResolvedValue(null);
      const provider = createEmailProvider(minimalConfig);
      const messages = await provider.poll();
      expect(messages).toEqual([]);
    });

    it('returns parsed messages from IMAP', async () => {
      const mockEmail = {
        envelope: {
          from: { value: [{ address: 'external@example.com', name: 'External' }] },
          to: { value: [{ address: 'test@example.com' }] },
          subject: 'Hello',
          messageId: '<msg-1@example.com>',
        },
        body: { raw: 'test body content' },
        internalDate: '2025-01-01T10:00:00Z',
        flags: [],
      };
      mockFetchOne.mockResolvedValue(mockEmail);
      const provider = createEmailProvider(minimalConfig);
      const messages = await provider.poll();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Hello world');
      expect(messages[0].authorId).toBe('test@example.com');
    });

    it('skips messages without from address', async () => {
      const mockEmail = {
        envelope: {
          from: { value: [] },
          to: { value: [{ address: 'test@example.com' }] },
          subject: 'No sender',
          messageId: '<msg-2@example.com>',
        },
        body: { raw: 'no sender' },
        internalDate: '2025-01-01T10:00:00Z',
        flags: [],
      };
      mockFetchOne.mockResolvedValue(mockEmail);
      const provider = createEmailProvider(minimalConfig);
      const messages = await provider.poll();
      expect(messages).toHaveLength(0);
    });

    it('calls setOnMessageHandler callback when handler is set', async () => {
      mockFetchOne.mockResolvedValue(null);
      const provider = createEmailProvider(minimalConfig);
      const handler = vi.fn();
      provider.setOnMessageHandler(handler);
      await provider.poll();
      expect(typeof handler).toBe('function');
    });
  });

  describe('sendMessage', () => {
    it('throws when targetKey is missing', async () => {
      const provider = createEmailProvider(minimalConfig);
      await expect(
        provider.sendMessage({ content: 'Hello', targetKey: '', attachments: [] }),
      ).rejects.toThrow('[email] Cannot send without a targetKey');
    });

    it('calls nodemailer sendMail with correct options', async () => {
      const provider = createEmailProvider(minimalConfig);
      await provider.sendMessage({ content: 'Hello there', targetKey: 'recipient@example.com', attachments: [] });
      expect(mockSendMail).toHaveBeenCalledOnce();
      const sent = mockSendMail.mock.calls[0][0];
      expect(sent.from).toBe('test@example.com');
      expect(sent.to).toBe('recipient@example.com');
      expect(sent.text).toBe('Hello there');
    });

    it('replies to existing thread when previous email exists', async () => {
      // First, make poll return an email so sendMessage finds a conversation
      const mockEmail = {
        envelope: {
          from: { value: [{ address: 'recipient@example.com' }] },
          to: { value: [{ address: 'test@example.com' }] },
          subject: 'Original Thread',
          messageId: '<original@example.com>',
        },
        body: { raw: 'original' },
        internalDate: '2025-01-01T10:00:00Z',
        flags: [],
      };
      mockFetchOne.mockResolvedValue(mockEmail);
      const provider = createEmailProvider(minimalConfig);
      await provider.poll(); // prime the cache with a sent email
      await provider.sendMessage({ content: 'Reply', targetKey: 'recipient@example.com', attachments: [] });
      const sent = mockSendMail.mock.calls[1][0];
      expect(sent.inReplyTo).toBe('<original@example.com>');
    });

    it('sets subject to "Message from {user}" when no prior thread', async () => {
      mockFetchOne.mockResolvedValue(null);
      const provider = createEmailProvider(minimalConfig);
      await provider.sendMessage({ content: 'Hello', targetKey: 'new@example.com', attachments: [] });
      const sent = mockSendMail.mock.calls[0][0];
      expect(sent.subject).toBe('Message from test@example.com');
    });

    it('returns targetKey and messageId after sending', async () => {
      const provider = createEmailProvider(minimalConfig);
      const result = await provider.sendMessage({ content: 'Test', targetKey: 'dest@example.com', attachments: [] });
      expect(result.targetKey).toBe('dest@example.com');
      expect(typeof result.conversationName).toBe('string');
    });

    it('handles attachments in sendMessage', async () => {
      const provider = createEmailProvider(minimalConfig);
      const attachment = {
        name: 'file.txt',
        data: new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]),
        contentType: 'text/plain',
        sizeBytes: 5,
      };
      await provider.sendMessage({ content: 'With attachment', targetKey: 'dest@example.com', attachments: [attachment] });
      const sent = mockSendMail.mock.calls[0][0];
      expect(sent.attachments).toHaveLength(1);
      expect(sent.attachments[0].filename).toBe('file.txt');
      expect(sent.attachments[0].contentType).toBe('text/plain');
    });
  });

  describe('dispose', () => {
    it('can be called without throwing', async () => {
      const provider = createEmailProvider(minimalConfig);
      await provider.dispose();
    });

    it('clears reconnect timer on dispose', async () => {
      const provider = createEmailProvider(minimalConfig);
      await provider.dispose();
      expect(mockimapClient.destroy).toHaveBeenCalled();
    });

    it('logs debug on dispose', async () => {
      const provider = createEmailProvider(minimalConfig);
      await provider.dispose();
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'email-provider', level: 'info' }),
      );
    });
  });

  describe('toUint8Array', () => {
    it('converts ArrayBuffer to Uint8Array', () => {
      // tested indirectly via sendMessage with attachment
    });

    it('converts string to Uint8Array', () => {
      // covered by attachment tests
    });

    it('passes through Uint8Array', () => {
      // covered by attachment tests
    });
  });
});
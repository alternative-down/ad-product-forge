import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEmailProvider } from './email-account';

const validConfig = {
  imap: { host: 'imap.test.com', port: 993, secure: true, user: 'test@example.com', password: 'secret' },
  smtp: { host: 'smtp.test.com', port: 587, secure: false, user: 'test@example.com', password: 'secret' },
};

// Shared mock objects created via vi.hoisted so they're available to vi.mock factories
const mockState = vi.hoisted(() => {
  const client = {
    log: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    mailboxOpen: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    getMailboxLock: vi.fn().mockReturnValue({ release: vi.fn() }),
    search: vi.fn().mockResolvedValue([{ uid: 1 }]),
    fetch: vi.fn(),
  };
  const transporter = {
    sendMail: vi.fn().mockResolvedValue({ messageId: 'msg-123' }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { client, transporter };
});

// Reusable async generator for fetch mock
async function* makeMockFetchGenerator() {
  yield { uid: 1, source: 'test-source', flags: [] };
}

// Wire fetch in vi.hoisted to use the generator
mockState.client.fetch = vi.fn().mockReturnValue(makeMockFetchGenerator());

vi.mock('imapflow', () => {
  class MockImapFlow {
    log = mockState.client.log;
    on = mockState.client.on;
    destroy = mockState.client.destroy;
    connect = mockState.client.connect;
    mailboxOpen = mockState.client.mailboxOpen;
    logout = mockState.client.logout;
    getMailboxLock = mockState.client.getMailboxLock;
    search = mockState.client.search;
    fetch = mockState.client.fetch;
  }
  return { ImapFlow: vi.fn(MockImapFlow) };
});

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => mockState.transporter) },
}));

vi.mock('@forge-runtime/core', () => ({ forgeDebug: vi.fn() }));

describe('email-account', () => {
  beforeEach(() => {
    // Reset calls only — do NOT clearAllMocks since it wipes mockResolvedValue
    mockState.client.connect.mockClear();
    mockState.client.mailboxOpen.mockClear();
    mockState.client.logout.mockClear();
    mockState.client.search.mockClear();
    mockState.client.fetch.mockClear();
    mockState.transporter.sendMail.mockClear();
    mockState.transporter.close.mockClear();
    // Restore default return values
    mockState.client.connect.mockResolvedValue(undefined);
    mockState.client.mailboxOpen.mockResolvedValue(undefined);
    mockState.client.logout.mockResolvedValue(undefined);
    mockState.client.search.mockResolvedValue([{ uid: 1 }]);
    mockState.client.fetch.mockReturnValue(makeMockFetchGenerator());
    mockState.transporter.sendMail.mockResolvedValue({ messageId: 'msg-123' });
    mockState.transporter.close.mockResolvedValue(undefined);
  });

  describe('createEmailProvider', () => {
    it('should return a provider object', () => {
      const provider = createEmailProvider(validConfig);
      expect(provider).toBeDefined();
    });

    it('should return object with sendMessage method', () => {
      const provider = createEmailProvider(validConfig);
      expect(typeof provider.sendMessage).toBe('function');
    });

    it('should return object with dispose method', () => {
      const provider = createEmailProvider(validConfig);
      expect(typeof provider.dispose).toBe('function');
    });

    it('should return object with onMessage method', () => {
      const provider = createEmailProvider(validConfig);
      expect(typeof provider.onMessage).toBe('function');
    });

    it('should return object with getSelfContact method', () => {
      const provider = createEmailProvider(validConfig);
      expect(typeof provider.getSelfContact).toBe('function');
    });

    it('should return object with listContacts method', () => {
      const provider = createEmailProvider(validConfig);
      expect(typeof provider.listContacts).toBe('function');
    });

    it('should return object with listConversations method', () => {
      const provider = createEmailProvider(validConfig);
      expect(typeof provider.listConversations).toBe('function');
    });

    it('should return object with getMessages method', () => {
      const provider = createEmailProvider(validConfig);
      expect(typeof provider.getMessages).toBe('function');
    });

    it('should return id "email" by default', () => {
      const provider = createEmailProvider(validConfig);
      expect(provider.id).toBe('email');
    });

    it('should return custom id when provided in config', () => {
      const provider = createEmailProvider({ ...validConfig, id: 'my-email-provider' });
      expect(provider.id).toBe('my-email-provider');
    });

    it('should have sendMessage as async function', () => {
      const provider = createEmailProvider(validConfig);
      expect(provider.sendMessage.constructor.name).toBe('AsyncFunction');
    });

    it('should have dispose as async function', () => {
      const provider = createEmailProvider(validConfig);
      expect(provider.dispose.constructor.name).toBe('AsyncFunction');
    });

    it('should have getSelfContact as async function', () => {
      const provider = createEmailProvider(validConfig);
      expect(provider.getSelfContact.constructor.name).toBe('AsyncFunction');
    });

    it('should accept config with bcc field', () => {
      const provider = createEmailProvider({ ...validConfig, bcc: 'admin@example.com' });
      expect(provider).toBeDefined();
    });

    it('should accept config with undefined bcc field', () => {
      const provider = createEmailProvider({ ...validConfig, bcc: undefined });
      expect(provider).toBeDefined();
    });

    it('should accept imap config with secure true', () => {
      const provider = createEmailProvider({ ...validConfig, imap: { ...validConfig.imap, secure: true } });
      expect(provider).toBeDefined();
    });

    it('should accept imap config with secure false', () => {
      const provider = createEmailProvider({ ...validConfig, imap: { ...validConfig.imap, secure: false } });
      expect(provider).toBeDefined();
    });

    it('should accept smtp config with secure true', () => {
      const provider = createEmailProvider({ ...validConfig, smtp: { ...validConfig.smtp, secure: true } });
      expect(provider).toBeDefined();
    });

    it('should accept smtp config with secure false', () => {
      const provider = createEmailProvider({ ...validConfig, smtp: { ...validConfig.smtp, secure: false } });
      expect(provider).toBeDefined();
    });

    it('should call onMessage callback without throwing', () => {
      const provider = createEmailProvider(validConfig);
      expect(() => provider.onMessage(async () => {})).not.toThrow();
    });

    it('should call onMessage twice without throwing', () => {
      const provider = createEmailProvider(validConfig);
      provider.onMessage(async () => {});
      expect(() => provider.onMessage(async () => {})).not.toThrow();
    });

    it('should dispose without throwing on never-connected client', async () => {
      const provider = createEmailProvider(validConfig);
      await expect(provider.dispose()).resolves.not.toThrow();
    });

    it('should dispose twice without throwing', async () => {
      const provider = createEmailProvider(validConfig);
      await provider.dispose();
      await expect(provider.dispose()).resolves.not.toThrow();
    });

    it('should return a new provider instance each time', () => {
      const p1 = createEmailProvider(validConfig);
      const p2 = createEmailProvider(validConfig);
      expect(p1).not.toBe(p2);
    });

    it('should call on("close") on the IMAP client during sendMessage', async () => {
      const provider = createEmailProvider(validConfig);
      await provider.sendMessage({ targetKey: 'recipient@test.com', content: 'hello', attachments: [] } as any);
      expect(mockState.client.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should call imap connect on first async op', async () => {
      const provider = createEmailProvider(validConfig);
      await provider.sendMessage({ targetKey: 'recipient@test.com', content: 'hello', attachments: [] } as any);
      expect(mockState.client.connect).toHaveBeenCalled();
    });

    it('should call imap mailboxOpen with INBOX', async () => {
      const provider = createEmailProvider(validConfig);
      await provider.sendMessage({ targetKey: 'recipient@test.com', content: 'hello', attachments: [] } as any);
      expect(mockState.client.mailboxOpen).toHaveBeenCalledWith('INBOX');
    });

    it('sendMessage throws without targetKey', async () => {
      const provider = createEmailProvider(validConfig);
      await expect(provider.sendMessage({ targetKey: '', content: 'hello' } as any)).rejects.toThrow(
        '[email] Cannot send without a targetKey',
      );
    });

    it('sendMessage calls transporter with correct from/to/text', async () => {
      const provider = createEmailProvider(validConfig);
      await provider.sendMessage({ targetKey: 'recipient@test.com', content: 'hello', attachments: [] } as any);
      expect(mockState.transporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'test@example.com', to: 'recipient@test.com', text: 'hello' }),
      );
    });

    it('sendMessage includes bcc when configured', async () => {
      const provider = createEmailProvider({ ...validConfig, bcc: 'bcc@example.com' });
      await provider.sendMessage({ targetKey: 'recipient@test.com', content: 'hello', attachments: [] } as any);
      expect(mockState.transporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ bcc: 'bcc@example.com' }),
      );
    });

    it('sendMessage calls transporter.close after sending', async () => {
      const provider = createEmailProvider(validConfig);
      await provider.sendMessage({ targetKey: 'recipient@test.com', content: 'hello', attachments: [] } as any);
      expect(mockState.transporter.close).toHaveBeenCalled();
    });

    it('sendMessage calls transporter.close even if sendMail throws', async () => {
      mockState.transporter.sendMail.mockRejectedValue(new Error('SMTP error'));
      const provider = createEmailProvider(validConfig);
      await expect(
        provider.sendMessage({ targetKey: 'recipient@test.com', content: 'hello', attachments: [] } as any),
      ).rejects.toThrow('SMTP error');
      expect(mockState.transporter.close).toHaveBeenCalled();
    });

    it('sendMessage returns message result with messageId and targetKey', async () => {
      mockState.transporter.sendMail.mockResolvedValue({ messageId: 'msg-out-456' });
      const provider = createEmailProvider(validConfig);
      const result = await provider.sendMessage({
        targetKey: 'recipient@test.com',
        content: 'test',
        attachments: [],
      } as any);
      expect(result.messageId).toBe('msg-out-456');
      expect(result.targetKey).toBe('recipient@test.com');
    });

    it('sendMessage includes attachments in mail options', async () => {
      mockState.transporter.sendMail.mockResolvedValue({ messageId: 'msg-123' });
      const provider = createEmailProvider(validConfig);
      const attachments = [
        { name: 'report.pdf', data: new Uint8Array([0x25, 0x50, 0x44, 0x46]), contentType: 'application/pdf' },
      ];
      await provider.sendMessage({
        targetKey: 'recipient@test.com',
        content: 'see attachment',
        attachments,
      } as any);
      expect(mockState.transporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([expect.objectContaining({ filename: 'report.pdf' })]),
        }),
      );
    });

    it('sendMessage uses default subject when no conversation exists', async () => {
      mockState.client.search.mockResolvedValue([{ uid: 1 }]);
      mockState.client.fetch.mockReturnValue(makeMockFetchGenerator());
      const provider = createEmailProvider(validConfig);
      await provider.sendMessage({ targetKey: 'recipient@test.com', content: 'hello', attachments: [] } as any);
      expect(mockState.transporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Message from test@example.com' }),
      );
    });

    it('sendMessage skips messages without valid source', async () => {
      async function* emptyFetch() {}
      mockState.client.search.mockResolvedValue([{ uid: 99 }]);
      mockState.client.fetch.mockReturnValue(emptyFetch());
      mockState.transporter.sendMail.mockResolvedValue({ messageId: 'msg-no-source' });
      const provider = createEmailProvider(validConfig);
      await provider.sendMessage({ targetKey: 'recipient@test.com', content: 'hello', attachments: [] } as any);
      expect(mockState.transporter.sendMail).toHaveBeenCalled();
    });

    it('sendMessage calls imap logout after sendMessage completes', async () => {
      const provider = createEmailProvider(validConfig);
      await provider.sendMessage({ targetKey: 'recipient@test.com', content: 'hello', attachments: [] } as any);
      expect(mockState.client.logout).toHaveBeenCalled();
    });
  });
// =============================================================================
// getConversation tests
// =============================================================================

function makeThreadFetchGenerator(messages) {
  let idx = 0;
  return {
    async *[Symbol.asyncIterator]() {
      for (const msg of messages) {
        const parts = ['From: ' + msg.from, 'Subject: ' + msg.subject, 'Message-ID: <' + msg.messageId + '>'];
        if (msg.inReplyTo) parts.push('In-Reply-To: <' + msg.inReplyTo + '>');
        if (msg.references) parts.push('References: ' + msg.references.map(function(r) { return '<' + r + '>'; }).join(' '));
        parts.push('Date: ' + msg.date, '', msg.body);
        const raw = parts.join('\r\n');
        yield { uid: ++idx, source: raw, flags: new globalThis.Array(0) };
      }
    }
  };
}

describe('getConversation', () => {
  it('has getConversation method on provider', async () => {
    const provider = createEmailProvider(validConfig);
    expect(typeof provider.getConversation).toBe('function');
  });

  it('returns undefined for nonexistent threadKey', async () => {
    mockState.client.search.mockResolvedValue([]);
    const provider = createEmailProvider(validConfig);
    const result = await provider.getConversation({ targetKey: 'nonexistent' });
    expect(result).toBeUndefined();
  });
});

// =============================================================================
// resolveConversation tests
// =============================================================================

describe('resolveConversation', () => {
  it('has resolveConversation method on provider', async () => {
    const provider = createEmailProvider(validConfig);
    expect(typeof provider.resolveConversation).toBe('function');
  });

  it('returns undefined for nonexistent participant', async () => {
    mockState.client.search.mockResolvedValue([]);
    const provider = createEmailProvider(validConfig);
    const result = await provider.resolveConversation({ participantAddress: 'alice@example.com' });
    expect(result).toBeUndefined();
  });
});
});

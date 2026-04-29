import { describe, expect, it } from 'vitest';
import type {
  CommunicationAttachmentView,
  CommunicationContactView,
  CommunicationConversationView,
  CommunicationFile,
  CommunicationInboundMessage,
  CommunicationMessageView,
  CommunicationProvider,
  CommunicationProviderConversation,
  CommunicationProviderContact,
  CommunicationProviderMessage,
} from './communication.js';

describe('communication', () => {
  describe('CommunicationFile', () => {
    it('accepts minimal file', () => {
      const file: CommunicationFile = {
        name: 'doc.txt',
        data: new Uint8Array([72, 101, 108, 108, 111]),
      };
      expect(file.name).toBe('doc.txt');
    });

    it('accepts file with metadata', () => {
      const file: CommunicationFile = {
        name: 'image.png',
        data: new Uint8Array(10),
        contentType: 'image/png',
        sizeBytes: 1024,
      };
      expect(file.contentType).toBe('image/png');
      expect(file.sizeBytes).toBe(1024);
    });
  });

  describe('CommunicationAttachmentView', () => {
    it('accepts minimal attachment', () => {
      const att: CommunicationAttachmentView = {
        path: '/files/123',
        name: 'report.pdf',
      };
      expect(att.name).toBe('report.pdf');
    });

    it('accepts attachment with content type', () => {
      const att: CommunicationAttachmentView = {
        path: '/files/456',
        name: 'data.json',
        contentType: 'application/json',
        sizeBytes: 256,
      };
      expect(att.contentType).toBe('application/json');
    });
  });

  describe('CommunicationContactView', () => {
    it('accepts contact with minimal fields', () => {
      const contact: CommunicationContactView = {
        targetKey: 'user-123',
        slug: 'john-doe',
        displayName: 'John Doe',
        description: undefined,
        metadata: { slug: 'john-doe' },
      };
      expect(contact.targetKey).toBe('user-123');
    });

    it('accepts contact with description', () => {
      const contact: CommunicationContactView = {
        targetKey: 'user-456',
        slug: 'jane',
        displayName: 'Jane Smith',
        description: 'Engineering team',
        metadata: { slug: 'jane' },
      };
      expect(contact.description).toBe('Engineering team');
    });
  });

  describe('CommunicationInboundMessage', () => {
    it('accepts inbound message', () => {
      const msg: CommunicationInboundMessage = {
        targetKey: 'room-1',
        messageId: 'msg-001',
        content: 'Hello, world!',
        createdAt: '2024-01-01T00:00:00Z',
      };
      expect(msg.content).toBe('Hello, world!');
    });

    it('accepts inbound with author info', () => {
      const msg: CommunicationInboundMessage = {
        targetKey: 'room-2',
        messageId: 'msg-002',
        authorId: 'user-1',
        authorDisplayName: 'Alice',
        authorUsername: 'alice',
        content: 'Hi there',
        createdAt: '2024-01-02T00:00:00Z',
        attachments: [{ name: 'file.txt', data: new Uint8Array(0) }],
      };
      expect(msg.authorUsername).toBe('alice');
    });
  });

  describe('CommunicationProviderMessage', () => {
    it('accepts provider message', () => {
      const msg: CommunicationProviderMessage = {
        messageId: 'pm-001',
        provider: 'internal-chat',
        content: 'Test message',
        attachments: [],
        unread: false,
        createdAt: '2024-01-03T00:00:00Z',
      };
      expect(msg.provider).toBe('internal-chat');
    });

    it('accepts message with optional fields', () => {
      const msg: CommunicationProviderMessage = {
        messageId: 'pm-002',
        provider: 'slack',
        authorId: 'author-1',
        targetKey: 'channel-1',
        content: 'Slack message',
        attachments: [{ name: 'doc.pdf', data: new Uint8Array(0) }],
        unread: true,
        createdAt: '2024-01-04T00:00:00Z',
        authorDisplayName: 'Bob',
      };
      expect(msg.unread).toBe(true);
    });
  });

  describe('CommunicationProviderContact', () => {
    it('accepts contact', () => {
      const contact: CommunicationProviderContact = {
        slug: 'contact-1',
        displayName: 'Contact One',
      };
      expect(contact.slug).toBe('contact-1');
    });

    it('accepts contact with all fields', () => {
      const contact: CommunicationProviderContact = {
        targetKey: 'ct-key',
        slug: 'contact-2',
        displayName: 'Contact Two',
        description: 'A contact',
        metadata: { slug: 'contact-2' },
      };
      expect(contact.metadata?.slug).toBe('contact-2');
    });
  });

  describe('CommunicationProviderConversation', () => {
    it('accepts conversation', () => {
      const conv: CommunicationProviderConversation = {
        targetKey: 'conv-1',
        provider: 'internal-chat',
        latestMessageAt: '2024-01-05T00:00:00Z',
        unreadCount: 3,
        messages: [],
      };
      expect(conv.unreadCount).toBe(3);
    });

    it('accepts conversation with messages', () => {
      const conv: CommunicationProviderConversation = {
        targetKey: 'conv-2',
        provider: 'slack',
        latestMessageAt: '2024-01-06T00:00:00Z',
        unreadCount: 0,
        name: 'General',
        participants: ['user-1', 'user-2'],
        messages: [{
          messageId: 'm1',
          provider: 'slack',
          content: 'Hello',
          attachments: [],
          unread: false,
          createdAt: '2024-01-06T00:00:00Z',
        }],
      };
      expect(conv.messages).toHaveLength(1);
    });
  });

  describe('CommunicationMessageView', () => {
    it('accepts message view', () => {
      const msg: CommunicationMessageView = {
        messageId: 'v1',
        provider: 'internal-chat',
        content: 'View message',
        attachments: [],
        unread: false,
        createdAt: '2024-01-07T00:00:00Z',
      };
      expect(msg.content).toBe('View message');
    });
  });

  describe('CommunicationConversationView', () => {
    it('accepts conversation view', () => {
      const conv: CommunicationConversationView = {
        targetKey: 'cv-1',
        provider: 'slack',
        latestMessageAt: '2024-01-08T00:00:00Z',
        unreadCount: 1,
        name: undefined,
        participants: undefined,
        messages: [],
      };
      expect(conv.unreadCount).toBe(1);
    });
  });

  describe('CommunicationProvider', () => {
    it('accepts provider with sendMessage', () => {
      const provider: CommunicationProvider = {
        id: 'provider-1',
        async sendMessage(input) {
          return { targetKey: input.targetKey, messageId: 'new-msg' };
        },
      };
      expect(typeof provider.sendMessage).toBe('function');
    });

    it('accepts provider with optional methods', async () => {
      const provider: CommunicationProvider = {
        id: 'provider-2',
        async sendMessage(input) {
          return { targetKey: input.targetKey };
        },
        async getSelfContact() {
          return null;
        },
      };
      const contact = await provider.getSelfContact!();
      expect(contact).toBeNull();
    });

    it('accepts provider with onMessage callback', () => {
      const provider: CommunicationProvider = {
        id: 'provider-3',
        async sendMessage(input) {
          return { targetKey: input.targetKey };
        },
        async onMessage(_callback) {
          // callback registered
        },
      };
      expect(typeof provider.onMessage).toBe('function');
    });
  });
});

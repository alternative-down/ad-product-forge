import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createExternalAccountTools } from './communication-tools.js';
// createTool used by vi.mock only; imported value needed for hoisting check

vi.mock('./tools.js', () => ({ createTool: vi.fn((def) => def) }));

const mockContacts: Array<{ slug: string; displayName: string }> = [
  { slug: 'user-a', displayName: 'Alice' },
  { slug: 'user-b', displayName: 'Bob' },
];
const mockConversations = [
  {
    provider: 'internal-chat',
    targetKey: 'conv-1',
    name: 'Team Chat',
    messages: [
      {
        messageId: 'm1',
        createdAt: '2026-04-29T10:00:00Z',
        unread: false,
        authorDisplayName: 'Alice',
        content: 'Hello world',
        attachments: [],
      },
    ],
    participants: ['alice', 'bob'],
    latestMessageAt: '2026-04-29T10:00:00Z',
    unreadCount: 0,
  },
];
const mockMessages = [
  {
    messageId: 'm1',
    createdAt: '2026-04-29T10:00:00Z',
    unread: false,
    authorDisplayName: 'Alice',
    content: 'Hello',
    attachments: [],
    provider: 'internal-chat',
    targetKey: 'conv-1',
  },
];
const mockConv = {
  provider: 'internal-chat',
  targetKey: 'conv-1',
  name: 'Team',
  messages: [
    {
      messageId: 'm1',
      createdAt: '2026-04-29T10:00:00Z',
      unread: false,
      authorDisplayName: 'Alice',
      content: 'Hello world and some extra content',
      attachments: [],
    },
    {
      messageId: 'm2',
      createdAt: '2026-04-29T10:01:00Z',
      unread: true,
      authorDisplayName: 'Bob',
      content: 'Reply here',
      attachments: [{ type: 'file' as const, name: 'doc.pdf', url: 'https://example.com/doc.pdf' }],
    },
  ],
  participants: ['alice', 'bob', 'charlie', 'david', 'eve', 'frank', 'grace', 'henry', 'iris'],
  latestMessageAt: '2026-04-29T10:01:00Z',
  unreadCount: 1,
};

// Stable mock functions — created once, reused across all tests
const mockListContacts = vi.fn();
const mockListConversations = vi.fn();
const mockGetMessages = vi.fn();
const mockSendMessage = vi.fn();
const mockUpsertContact = vi.fn();

function resetMocks() {
  mockListContacts.mockReset();
  mockListConversations.mockReset();
  mockGetMessages.mockReset();
  mockSendMessage.mockReset();
  mockUpsertContact.mockReset();
  // Default resolved values
  mockListContacts.mockResolvedValue(mockContacts);
  mockListConversations.mockResolvedValue(mockConversations);
  mockGetMessages.mockResolvedValue(mockMessages);
  mockSendMessage.mockResolvedValue({ delivered: true });
  mockUpsertContact.mockResolvedValue({ slug: 'new-slug', displayName: 'New Contact' });
}

function buildComm() {
  return {
    listContacts: mockListContacts,
    listConversations: mockListConversations,
    getMessages: mockGetMessages,
    sendMessage: mockSendMessage,
    upsertContact: mockUpsertContact,
  };
}

function tools() {
  return createExternalAccountTools(buildComm() as never);
}

beforeEach(() => {
  resetMocks();
});

describe('createExternalAccountTools', () => {
  it('creates all 5 tools', () => {
    const t = tools();
    expect(Object.keys(t)).toHaveLength(5);
    expect(t).toHaveProperty('list_contacts');
    expect(t).toHaveProperty('upsert_contact');
    expect(t).toHaveProperty('list_conversations');
    expect(t).toHaveProperty('get_messages');
    expect(t).toHaveProperty('send_message');
  });
});

describe('list_contacts tool', () => {
  it('has correct id', () => {
    const { list_contacts } = tools();
    expect(list_contacts.id).toBe('list_contacts');
  });

  it('returns contacts on success with default filter', async () => {
    const { list_contacts } = tools();
    const result = await list_contacts.execute!({});
    expect(result).toEqual({ valid: true, contacts: mockContacts });
    expect(mockListContacts).toHaveBeenCalledWith('others');
  });

  it('passes filter to listContacts', async () => {
    const { list_contacts } = tools();
    await list_contacts.execute!({ filter: 'all' });
    expect(mockListContacts).toHaveBeenCalledWith('all');
  });

  it('returns error on failure', async () => {
    mockListContacts.mockRejectedValueOnce(new Error('store unavailable'));
    const { list_contacts } = tools();
    const result = await list_contacts.execute!({});
    expect(result).toMatchObject({ valid: false, error: 'store unavailable' });
  });
});

describe('upsert_contact tool', () => {
  it('returns contact on success', async () => {
    const { upsert_contact } = tools();
    const result = await upsert_contact.execute!({
      slug: 'john',
      displayName: 'John Doe',
      description: 'Dev',
    });
    expect(result).toMatchObject({ valid: true, slug: 'new-slug', displayName: 'New Contact' });
    expect(mockUpsertContact).toHaveBeenCalledWith({
      slug: 'john',
      displayName: 'John Doe',
      description: 'Dev',
    });
  });

  it('omits description when not provided', async () => {
    const { upsert_contact } = tools();
    await upsert_contact.execute!({ slug: 'jane', displayName: 'Jane' });
    expect(mockUpsertContact).toHaveBeenCalledWith({
      slug: 'jane',
      displayName: 'Jane',
      description: undefined,
    });
  });

  it('returns error on non-Error throw (uses errorMsg string passthrough + fallback hint)', async () => {
    mockUpsertContact.mockRejectedValueOnce('boom');
    const { upsert_contact } = tools();
    const result = await upsert_contact.execute!({ slug: 'x', displayName: 'Y' });
    expect(result).toMatchObject({
      valid: false,
      error: 'boom',
      hint: 'Verify the slug and displayName are valid.',
    });
  });

  it('returns specific error message on Error instance', async () => {
    mockUpsertContact.mockRejectedValueOnce(new Error('invalid slug'));
    const { upsert_contact } = tools();
    const result = await upsert_contact.execute!({ slug: 'bad slug', displayName: 'Bad' });
    expect(result).toMatchObject({ valid: false, error: 'invalid slug' });
  });
});

describe('list_conversations tool', () => {
  it('returns summarized conversations without valid field', async () => {
    const { list_conversations } = tools();
    const result = await list_conversations.execute!({});
    expect(result).not.toHaveProperty('valid');
    expect(result).toMatchObject({
      returnedConversationCount: 1,
      messagePreviewLimit: 3,
      messageContentCharLimit: 280,
    });
  });

  it('passes provider and unread filters', async () => {
    const { list_conversations } = tools();
    await list_conversations.execute!({ provider: 'slack', unread: true, limit: 50 });
    expect(mockListConversations).toHaveBeenCalledWith({
      provider: 'slack',
      unread: true,
      limit: 20,
    });
  });

  it('caps limit at MAX_RETURNED_CONVERSATIONS (20)', async () => {
    const { list_conversations } = tools();
    await list_conversations.execute!({ limit: 999 });
    expect(mockListConversations).toHaveBeenCalledWith({
      provider: undefined,
      unread: undefined,
      limit: 20,
    });
  });

  it('returns error on failure', async () => {
    mockListConversations.mockRejectedValueOnce(new Error('provider offline'));
    const { list_conversations } = tools();
    const result = await list_conversations.execute!({});
    expect(result).toMatchObject({ valid: false, error: 'provider offline' });
  });
});

describe('summarizeConversation (via list_conversations)', () => {
  it('truncates long message content to 280 chars', async () => {
    mockListConversations.mockResolvedValueOnce([
      {
        ...mockConv,
        messages: [{ ...mockConv.messages[0], content: 'A'.repeat(400), attachments: [] }],
      },
    ]);
    const { list_conversations } = tools();
    const result = await list_conversations.execute!({});
    expect(result.conversations[0].messages[0].content.length).toBeLessThanOrEqual(280);
  });

  it('limits participants to MAX_PARTICIPANTS (8)', async () => {
    mockListConversations.mockResolvedValueOnce([mockConv]);
    const { list_conversations } = tools();
    const result = await list_conversations.execute!({});
    expect(result.conversations[0].participants).toHaveLength(8);
    expect(result.conversations[0].hasMoreParticipants).toBe(true);
  });

  it('marks hasMoreMessages when more than 3 messages', async () => {
    mockListConversations.mockResolvedValueOnce([
      {
        ...mockConv,
        messages: [
          {
            messageId: 'm1',
            createdAt: '2026-01-01',
            unread: false,
            authorDisplayName: 'A',
            content: 'one',
            attachments: [],
          },
          {
            messageId: 'm2',
            createdAt: '2026-01-02',
            unread: false,
            authorDisplayName: 'A',
            content: 'two',
            attachments: [],
          },
          {
            messageId: 'm3',
            createdAt: '2026-01-03',
            unread: false,
            authorDisplayName: 'A',
            content: 'three',
            attachments: [],
          },
          {
            messageId: 'm4',
            createdAt: '2026-01-04',
            unread: false,
            authorDisplayName: 'A',
            content: 'four',
            attachments: [],
          },
        ],
      },
    ]);
    const { list_conversations } = tools();
    const result = await list_conversations.execute!({});
    expect(result.conversations[0].hasMoreMessages).toBe(true);
    expect(result.conversations[0].returnedMessageCount).toBe(3);
    expect(result.conversations[0].totalMessageCount).toBe(4);
  });

  it('hasMoreMessages false with 3 or fewer messages', async () => {
    mockListConversations.mockResolvedValueOnce([
      { ...mockConv, messages: mockConv.messages.slice(0, 2) },
    ]);
    const { list_conversations } = tools();
    const result = await list_conversations.execute!({});
    expect(result.conversations[0].hasMoreMessages).toBe(false);
  });

  it('maps attachment count', async () => {
    mockListConversations.mockResolvedValueOnce([mockConv]);
    const { list_conversations } = tools();
    const result = await list_conversations.execute!({});
    expect(result.conversations[0].messages[1].attachmentCount).toBe(1);
  });
});

describe('get_messages tool', () => {
  it('returns messages on success', async () => {
    const { get_messages } = tools();
    const result = await get_messages.execute!({
      provider: 'slack',
      targetKey: 'channel-1',
      limit: 50,
      offset: 10,
    });
    expect(result).toEqual({ valid: true, messages: mockMessages });
  });

  it('uses defaults for optional fields', async () => {
    const { get_messages } = tools();
    await get_messages.execute!({ provider: 'x', targetKey: 'y' });
    expect(mockGetMessages).toHaveBeenCalledWith({
      provider: 'x',
      targetKey: 'y',
      limit: 100,
      offset: 0,
      query: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    });
  });

  it('returns provider-hint on ProviderNotAvailable error', async () => {
    mockGetMessages.mockRejectedValueOnce(new Error('Provider not available: slack'));
    const { get_messages } = tools();
    const result = await get_messages.execute!({ provider: 'slack', targetKey: 'ch' });
    expect(result).toMatchObject({
      valid: false,
      hint: 'Use a provider configured for this agent.',
    });
  });

  it('returns generic hint on other errors', async () => {
    mockGetMessages.mockRejectedValueOnce(new Error('read failed'));
    const { get_messages } = tools();
    const result = await get_messages.execute!({ provider: 'x', targetKey: 'y' });
    expect(result).toMatchObject({
      valid: false,
      error: 'read failed',
      hint: 'Verify the provider and targetKey are valid.',
    });
  });
});

describe('send_message tool', () => {
  it('returns delivered result on success', async () => {
    const { send_message } = tools();
    const result = await send_message.execute!({
      provider: 'slack',
      targetKey: 'ch-1',
      content: 'Hello!',
      attachments: [],
    });
    expect(result).toEqual({ delivered: true });
    expect(mockSendMessage).toHaveBeenCalledWith({
      provider: 'slack',
      targetKey: 'ch-1',
      content: 'Hello!',
      attachments: [],
    });
  });

  it('returns error on failure', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('target offline'));
    const { send_message } = tools();
    const result = await send_message.execute!({ provider: 'x', targetKey: 'y', content: 'hi' });
    expect(result).toMatchObject({ valid: false, error: 'target offline' });
  });
});


describe('Phase 11 #5887 F2+F3: matcher tables and error helper', () => {
  it('send_message returns provider-not-available hint when matcher matches', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('Provider not available: slack'));
    const { send_message } = tools();
    const result = await send_message.execute!({ provider: 'slack', targetKey: 'ch', content: 'hi' });
    expect(result).toMatchObject({
      valid: false,
      error: 'Provider not available: slack',
      hint: 'Use a provider configured for this agent, such as internal-chat, email, or discord.',
    });
  });

  it('send_message returns attachment-outside-workspace hint when matcher matches', async () => {
    mockSendMessage.mockRejectedValueOnce(
      new Error('Attachment path is outside the workspace: /etc/passwd'),
    );
    const { send_message } = tools();
    const result = await send_message.execute!({ provider: 'x', targetKey: 'y', content: 'hi' });
    expect(result).toMatchObject({
      valid: false,
      hint: 'Attachment paths must point inside the workspace. Use a relative path or a path under the workspace root.',
    });
  });

  it('send_message returns ENOENT hint when matcher matches', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));
    const { send_message } = tools();
    const result = await send_message.execute!({ provider: 'x', targetKey: 'y', content: 'hi' });
    expect(result).toMatchObject({
      valid: false,
      hint: 'An attachment path does not exist on disk. Verify the file path and try again.',
    });
  });

  it('send_message returns fallback hint when no matcher matches', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('totally novel error'));
    const { send_message } = tools();
    const result = await send_message.execute!({ provider: 'x', targetKey: 'y', content: 'hi' });
    expect(result).toMatchObject({
      valid: false,
      error: 'totally novel error',
      hint: 'Verify the provider and targetKey are correct.',
    });
  });

  it('get_messages returns not-found hint when matcher matches', async () => {
    mockGetMessages.mockRejectedValueOnce(new Error('conversation does not exist'));
    const { get_messages } = tools();
    const result = await get_messages.execute!({ provider: 'x', targetKey: 'y' });
    expect(result).toMatchObject({
      valid: false,
      hint: 'The targetKey may not exist for this provider. Use list_conversations to find valid conversations.',
    });
  });

  it('get_messages returns does-not-support-reading hint when matcher matches', async () => {
    mockGetMessages.mockRejectedValueOnce(
      new Error('Provider does not support reading messages for this kind of targetKey'),
    );
    const { get_messages } = tools();
    const result = await get_messages.execute!({ provider: 'x', targetKey: 'y' });
    expect(result).toMatchObject({
      valid: false,
      hint: 'This provider does not support reading conversation history.',
    });
  });

  it('list_contacts returns fallback hint on generic error', async () => {
    mockListContacts.mockRejectedValueOnce(new Error('store down'));
    const { list_contacts } = tools();
    const result = await list_contacts.execute!({});
    expect(result).toMatchObject({
      valid: false,
      error: 'store down',
      hint: 'Try again in a moment. If the problem persists, verify the communication store is available.',
    });
  });

  it('list_contacts stringifies non-Error throw via errorMsg', async () => {
    mockListContacts.mockRejectedValueOnce({ code: 'INTERNAL' });
    const { list_contacts } = tools();
    const result = await list_contacts.execute!({});
    expect(result).toMatchObject({
      valid: false,
      error: JSON.stringify({ code: 'INTERNAL' }),
    });
  });
});


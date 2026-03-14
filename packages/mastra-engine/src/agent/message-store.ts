import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

const STATE_DIR = '.forge-state';
const STATE_FILE = 'accounts.json';

const accountSchema = z.object({
  accountId: z.string(),
  agentId: z.string(),
  provider: z.string(),
  externalAccountId: z.string(),
  displayName: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const contactIdentitySchema = z.object({
  provider: z.string(),
  externalUserId: z.string().optional(),
  username: z.string().optional(),
});

const contactSchema = z.object({
  agentId: z.string(),
  slug: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  accounts: z.array(contactIdentitySchema).default([]),
});

const attachmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  url: z.string(),
  contentType: z.string().optional(),
  sizeBytes: z.number().optional(),
  description: z.string().optional(),
});

const messageSchema = z.object({
  messageId: z.string(),
  accountId: z.string(),
  direction: z.enum(['inbound', 'outbound']),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
  username: z.string().optional(),
  content: z.string(),
  attachments: z.array(attachmentSchema).default([]),
  unread: z.boolean(),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const stateSchema = z.object({
  accounts: z.array(accountSchema).default([]),
  contacts: z.array(contactSchema).default([]),
  messages: z.array(messageSchema).default([]),
});

const inboundMessageInputSchema = z.object({
  agentId: z.string(),
  accountId: z.string(),
  messageId: z.string(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
  username: z.string().optional(),
  content: z.string(),
  attachments: z.array(attachmentSchema).default([]),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const sendMessageInputSchema = z
  .object({
    agentId: z.string(),
    provider: z.string(),
    target: z.string().optional(),
    contactSlug: z.string().optional(),
    content: z.string().min(1),
    replyToMessageId: z.string().optional(),
  })
  .refine((input) => Number(Boolean(input.target)) + Number(Boolean(input.contactSlug)) === 1, {
    message: 'Provide exactly one of target or contactSlug',
  });

const listConversationsInputSchema = z.object({
  agentId: z.string(),
  provider: z.string().optional(),
  contactSlug: z.string().optional(),
  unread: z.boolean().optional(),
  limit: z.number().int().positive().max(100).default(20),
});

const getMessagesInputSchema = z.object({
  agentId: z.string(),
  conversationId: z.string(),
  limit: z.number().int().positive().max(200).default(100),
});

type ContactIdentity = z.infer<typeof contactIdentitySchema>;
type StoredMessage = z.infer<typeof messageSchema>;
type State = z.infer<typeof stateSchema>;
type SenderInput = {
  target: string;
  contactSlug?: string;
  content: string;
  replyToMessageId?: string;
};
type SenderResult = {
  messageId?: string;
  channelId?: string;
};
type MessageView = {
  messageId: string;
  accountId: string;
  direction: 'inbound' | 'outbound';
  provider?: string;
  channelId?: string;
  channelName?: string;
  authorId?: string;
  authorName?: string;
  username?: string;
  content: string;
  attachments: z.infer<typeof attachmentSchema>[];
  unread: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
  contactSlug?: string;
  contactDisplayName?: string;
  conversationId: string;
};
type ConversationView = {
  conversationId: string;
  provider?: string;
  channelId?: string;
  channelName?: string;
  contactSlug?: string;
  contactDisplayName?: string;
  latestMessageAt: string;
  unreadCount: number;
  messages: MessageView[];
};

const senders = new Map<string, (input: SenderInput) => Promise<SenderResult>>();
let writeQueue = Promise.resolve();

function getStatePath() {
  return path.resolve(STATE_DIR, STATE_FILE);
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

  return slug || 'contact';
}

async function loadState() {
  try {
    const content = await readFile(getStatePath(), 'utf8');
    return stateSchema.parse(JSON.parse(content));
  } catch {
    return stateSchema.parse({});
  }
}

async function saveState(state: State) {
  await mkdir(path.resolve(STATE_DIR), { recursive: true });
  await writeFile(getStatePath(), JSON.stringify(state, null, 2), 'utf8');
}

async function updateState<T>(apply: (state: State) => Promise<T> | T): Promise<T> {
  const run = writeQueue.then(async () => {
    const state = await loadState();
    const result = await apply(state);
    await saveState(state);
    return result;
  });

  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

function findContactBySlug(state: State, agentId: string, slug: string) {
  return state.contacts.find((contact) => contact.agentId === agentId && contact.slug === slug) ?? null;
}

function findContactByIdentity(
  state: State,
  agentId: string,
  provider: string,
  externalUserId?: string,
  username?: string,
) {
  return (
    state.contacts.find(
      (contact) =>
        contact.agentId === agentId &&
        contact.accounts.some((account) => {
          if (account.provider !== provider) return false;
          if (externalUserId && account.externalUserId === externalUserId) return true;
          if (username && account.username === username) return true;
          return false;
        }),
    ) ?? null
  );
}

function ensureContact(
  state: State,
  input: {
    agentId: string;
    provider: string;
    externalUserId?: string;
    username?: string;
    displayName?: string;
  },
) {
  let contact = findContactByIdentity(state, input.agentId, input.provider, input.externalUserId, input.username);

  if (!contact) {
    const base = input.username || input.displayName || input.externalUserId || 'contact';
    const baseSlug = slugify(base);
    let slug = baseSlug;
    let suffix = 2;

    while (findContactBySlug(state, input.agentId, slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    contact = {
      agentId: input.agentId,
      slug,
      displayName: input.displayName || input.username || input.externalUserId || slug,
      accounts: [],
    };
    state.contacts.push(contact);
  }

  let identity = contact.accounts.find((account) => {
    if (account.provider !== input.provider) return false;
    if (input.externalUserId && account.externalUserId === input.externalUserId) return true;
    if (input.username && account.username === input.username) return true;
    return false;
  });

  if (!identity) {
    identity = {
      provider: input.provider,
      externalUserId: input.externalUserId,
      username: input.username,
    };
    contact.accounts.push(identity);
  }

  if (input.externalUserId) identity.externalUserId = input.externalUserId;
  if (input.username) identity.username = input.username;
  if (input.displayName) contact.displayName = input.displayName;

  return contact;
}

function getAgentAccount(state: State, agentId: string, provider: string) {
  return state.accounts.find((account) => account.agentId === agentId && account.provider === provider) ?? null;
}

function getAgentAccountIds(state: State, agentId: string, provider?: string) {
  return new Set(
    state.accounts
      .filter((account) => account.agentId === agentId)
      .filter((account) => (provider ? account.provider === provider : true))
      .map((account) => account.accountId),
  );
}

function getConversationId(message: {
  provider?: string;
  channelId?: string;
  contactSlug?: string;
  authorId?: string;
  messageId: string;
}) {
  return `${message.provider}:${message.channelId || message.contactSlug || message.authorId || message.messageId}`;
}

function toMessageView(state: State, agentId: string, message: StoredMessage): MessageView {
  const account = state.accounts.find((current) => current.accountId === message.accountId);
  const contact = account
    ? findContactByIdentity(state, agentId, account.provider, message.authorId, message.username)
    : null;

  return {
    messageId: message.messageId,
    accountId: message.accountId,
    direction: message.direction,
    provider: account?.provider,
    channelId: message.channelId,
    channelName: message.channelName,
    authorId: message.authorId,
    authorName: message.authorName,
    username: message.username,
    content: message.content,
    attachments: message.attachments,
    unread: message.unread,
    createdAt: message.createdAt,
    metadata: message.metadata,
    contactSlug: contact?.slug,
    contactDisplayName: contact?.displayName,
    conversationId: getConversationId({
      provider: account?.provider,
      channelId: message.channelId,
      contactSlug: contact?.slug,
      authorId: message.authorId,
      messageId: message.messageId,
    }),
  };
}

function markMessagesAsRead(state: State, accountIds: Set<string>, messages: Array<{ accountId: string; messageId: string; unread: boolean }>) {
  const unreadKeys = new Set(
    messages.filter((message) => message.unread).map((message) => `${message.accountId}:${message.messageId}`),
  );

  if (unreadKeys.size === 0) {
    return false;
  }

  let changed = false;

  for (const message of state.messages) {
    if (!accountIds.has(message.accountId)) continue;
    if (!unreadKeys.has(`${message.accountId}:${message.messageId}`)) continue;
    if (!message.unread) continue;
    message.unread = false;
    changed = true;
  }

  return changed;
}

async function ensureAccount(input: {
  agentId: string;
  provider: string;
  externalAccountId: string;
  displayName?: string;
  metadata?: Record<string, unknown>;
}) {
  return updateState((state) => {
    const accountId = `${input.agentId}:${input.provider}:${input.externalAccountId}`;
    let account = state.accounts.find((current) => current.accountId === accountId);

    if (!account) {
      account = {
        accountId,
        agentId: input.agentId,
        provider: input.provider,
        externalAccountId: input.externalAccountId,
      };
      state.accounts.push(account);
    }

    if (input.displayName !== undefined) {
      account.displayName = input.displayName;
    }

    if (input.metadata !== undefined) {
      account.metadata = input.metadata;
    }

    return accountId;
  });
}

function registerAccountSender(accountId: string, sender: (input: SenderInput) => Promise<SenderResult>) {
  senders.set(accountId, sender);
}

function unregisterAccountSender(accountId: string) {
  senders.delete(accountId);
}

async function ingestInboundMessage(input: z.input<typeof inboundMessageInputSchema>) {
  const message = inboundMessageInputSchema.parse(input);

  await updateState((state) => {
    const account = state.accounts.find((current) => current.accountId === message.accountId);
    if (!account) {
      throw new Error(`Account not found for inbound message: ${message.accountId}`);
    }

    if (state.messages.some((current) => current.accountId === message.accountId && current.messageId === message.messageId)) {
      return;
    }

    if (message.authorId || message.username || message.authorName) {
      ensureContact(state, {
        agentId: message.agentId,
        provider: account.provider,
        externalUserId: message.authorId,
        username: message.username,
        displayName: message.authorName,
      });
    }

    state.messages.push({
      messageId: message.messageId,
      accountId: message.accountId,
      direction: 'inbound',
      channelId: message.channelId,
      channelName: message.channelName,
      authorId: message.authorId,
      authorName: message.authorName,
      username: message.username,
      content: message.content,
      attachments: message.attachments,
      unread: true,
      createdAt: message.createdAt,
      metadata: message.metadata,
    });
  });
}

async function listAgentContacts(agentId: string) {
  const state = await loadState();
  return state.contacts.filter((contact) => contact.agentId === agentId);
}

async function getAgentContact(agentId: string, slug: string) {
  const state = await loadState();
  return findContactBySlug(state, agentId, slug);
}

async function upsertAgentContact(input: {
  agentId: string;
  slug: string;
  displayName: string;
  description?: string;
  accounts?: ContactIdentity[];
}) {
  return updateState((state) => {
    const slug = slugify(input.slug);
    let contact = findContactBySlug(state, input.agentId, slug);

    if (!contact) {
      contact = {
        agentId: input.agentId,
        slug,
        displayName: input.displayName,
        accounts: [],
      };
      state.contacts.push(contact);
    }

    contact.displayName = input.displayName;
    contact.description = input.description;

    for (const next of input.accounts ?? []) {
      let identity = contact.accounts.find((account) => {
        if (account.provider !== next.provider) return false;
        if (next.externalUserId && account.externalUserId === next.externalUserId) return true;
        if (next.username && account.username === next.username) return true;
        return false;
      });

      if (!identity) {
        identity = {
          provider: next.provider,
          externalUserId: next.externalUserId,
          username: next.username,
        };
        contact.accounts.push(identity);
      }

      if (next.externalUserId) identity.externalUserId = next.externalUserId;
      if (next.username) identity.username = next.username;
    }

    return contact;
  });
}

async function listMessageConversations(input: z.input<typeof listConversationsInputSchema>) {
  const parsed = listConversationsInputSchema.parse(input);
  const state = await loadState();
  const accountIds = getAgentAccountIds(state, parsed.agentId, parsed.provider);

  const messages = state.messages
    .filter((message) => accountIds.has(message.accountId))
    .filter((message) => (parsed.unread === undefined ? true : message.unread === parsed.unread))
    .map((message) => toMessageView(state, parsed.agentId, message))
    .filter((message) => (parsed.contactSlug ? message.contactSlug === parsed.contactSlug : true))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const conversations = new Map<string, ConversationView>();

  for (const message of messages) {
    let conversation = conversations.get(message.conversationId);

    if (!conversation) {
      conversation = {
        conversationId: message.conversationId,
        provider: message.provider,
        channelId: message.channelId,
        channelName: message.channelName,
        contactSlug: message.contactSlug,
        contactDisplayName: message.contactDisplayName,
        latestMessageAt: message.createdAt,
        unreadCount: 0,
        messages: [],
      };
      conversations.set(message.conversationId, conversation);
    }

    conversation.messages.push(message);
    conversation.latestMessageAt = message.createdAt;
    if (message.unread) {
      conversation.unreadCount += 1;
    }
  }

  const result = Array.from(conversations.values())
    .sort((a, b) => new Date(b.latestMessageAt).getTime() - new Date(a.latestMessageAt).getTime())
    .slice(0, parsed.limit)
    .map((conversation) => ({
      ...conversation,
      messages: conversation.messages.slice(-5),
    }));

  const messagesToMarkAsRead = result.flatMap((conversation) => conversation.messages).filter((message) => message.unread);

  if (messagesToMarkAsRead.length > 0) {
    await updateState((latestState) => {
      markMessagesAsRead(latestState, accountIds, messagesToMarkAsRead);
    });
  }

  return result;
}

async function getMessages(input: z.input<typeof getMessagesInputSchema>) {
  const parsed = getMessagesInputSchema.parse(input);
  const state = await loadState();
  const accountIds = getAgentAccountIds(state, parsed.agentId);

  const messages = state.messages
    .filter((message) => accountIds.has(message.accountId))
    .map((message) => toMessageView(state, parsed.agentId, message))
    .filter((message) => message.conversationId === parsed.conversationId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-parsed.limit);

  const messagesToMarkAsRead = messages.filter((message) => message.unread);

  if (messagesToMarkAsRead.length > 0) {
    await updateState((latestState) => {
      markMessagesAsRead(latestState, accountIds, messagesToMarkAsRead);
    });
  }

  return messages;
}

async function sendAccountMessage(input: z.input<typeof sendMessageInputSchema>) {
  const parsed = sendMessageInputSchema.parse(input);
  const state = await loadState();
  const account = getAgentAccount(state, parsed.agentId, parsed.provider);

  if (!account) {
    throw new Error(`Provider not found for agent: ${parsed.provider}`);
  }

  const replyToMessageId = parsed.replyToMessageId?.trim() || undefined;
  const repliedMessage = replyToMessageId
    ? state.messages.find((message) => message.accountId === account.accountId && message.messageId === replyToMessageId)
    : undefined;

  let target = parsed.target;

  if (parsed.contactSlug) {
    const contact = findContactBySlug(state, parsed.agentId, parsed.contactSlug);
    if (!contact) {
      throw new Error(`Contact not found: ${parsed.contactSlug}`);
    }

    const identity = contact.accounts.find((current) => current.provider === parsed.provider);
    if (!identity) {
      throw new Error(`No ${parsed.provider} identity found for contact: ${parsed.contactSlug}`);
    }

    if (replyToMessageId) {
      target = repliedMessage?.channelId;
      if (!target) {
        throw new Error(`No message context found for reply: ${replyToMessageId}`);
      }
    } else {
      target = identity.externalUserId || identity.username;
      if (!target) {
        throw new Error(`No direct identity found for contact: ${parsed.contactSlug}`);
      }
    }
  }

  if (!target) {
    throw new Error(`Target not resolved for provider: ${parsed.provider}`);
  }

  if (parsed.provider === 'internal-chat' && replyToMessageId && !repliedMessage) {
    throw new Error(`Unknown internal-chat replyToMessageId: ${replyToMessageId}`);
  }

  if (
    parsed.provider === 'internal-chat' &&
    replyToMessageId &&
    repliedMessage?.channelId &&
    repliedMessage.channelId !== target
  ) {
    throw new Error(
      `replyToMessageId ${replyToMessageId} belongs to channel ${repliedMessage.channelId}, but target ${target} was requested.`,
    );
  }

  const sender = senders.get(account.accountId);
  if (!sender) {
    throw new Error(`No active sender registered for provider: ${parsed.provider}`);
  }

  const result = await sender({
    target,
    contactSlug: parsed.contactSlug,
    content: parsed.content,
    replyToMessageId,
  });

  const messageId = result.messageId || `out:${Date.now()}`;
  const channelId = result.channelId || target;

  await updateState((latestState) => {
    latestState.messages.push({
      messageId,
      accountId: account.accountId,
      direction: 'outbound',
      channelId,
      content: parsed.content,
      attachments: [],
      unread: false,
      createdAt: new Date().toISOString(),
      metadata: {
        provider: parsed.provider,
        contactSlug: parsed.contactSlug,
        replyToMessageId,
      },
    });
  });

  return {
    success: true,
    messageId,
  };
}

export const messageStore = {
  ensureAccount,
  registerAccountSender,
  unregisterAccountSender,
  ingestInboundMessage,
  listAgentContacts,
  getAgentContact,
  upsertAgentContact,
  listMessageConversations,
  getMessages,
  sendAccountMessage,
};

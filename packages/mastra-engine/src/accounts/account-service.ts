import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

const ACCOUNT_STATE_DIR = '.forge-state';
const ACCOUNT_STATE_FILE = 'accounts.json';

const accountSchema = z.object({
  accountId: z.string(),
  agentId: z.string(),
  provider: z.string(),
  externalAccountId: z.string(),
  displayName: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const contactAccountSchema = z.object({
  provider: z.string(),
  externalUserId: z.string().optional(),
  username: z.string().optional(),
});

const contactSchema = z.object({
  agentId: z.string(),
  slug: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  accounts: z.array(contactAccountSchema).default([]),
});

const attachmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  url: z.string(),
  contentType: z.string().optional(),
  sizeBytes: z.number().optional(),
  description: z.string().optional(),
});

const accountMessageSchema = z.object({
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
  metadata: z.record(z.unknown()).optional(),
});

const accountStateSchema = z.object({
  accounts: z.array(accountSchema).default([]),
  contacts: z.array(contactSchema).default([]),
  messages: z.array(accountMessageSchema).default([]),
});

const sendInputSchema = z.object({
  agentId: z.string(),
  provider: z.string(),
  target: z.string().optional(),
  contactSlug: z.string().optional(),
  content: z.string().min(1),
  replyToMessageId: z.string().optional(),
  mode: z.enum(['send', 'reply']).default('send'),
}).refine((input) => Number(Boolean(input.target)) + Number(Boolean(input.contactSlug)) === 1, {
  message: 'Provide exactly one of target or contactSlug',
});

const inboundMessageSchema = z.object({
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
  metadata: z.record(z.unknown()).optional(),
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

const activeSenders = new Map<
  string,
  (input: z.infer<typeof sendInputSchema>) => Promise<{ messageId?: string; channelId?: string }>
>();
let mutationQueue = Promise.resolve();

function slugifyContact(value: string) {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

  return slug || 'contact';
}

function getStatePath() {
  return path.resolve(ACCOUNT_STATE_DIR, ACCOUNT_STATE_FILE);
}

async function readState() {
  try {
    const content = await readFile(getStatePath(), 'utf8');
    return accountStateSchema.parse(JSON.parse(content));
  } catch {
    return accountStateSchema.parse({});
  }
}

async function writeState(state: z.infer<typeof accountStateSchema>) {
  await mkdir(path.resolve(ACCOUNT_STATE_DIR), { recursive: true });
  await writeFile(getStatePath(), JSON.stringify(state, null, 2), 'utf8');
}

async function withStateMutation<T>(
  fn: (state: z.infer<typeof accountStateSchema>) => Promise<T> | T,
): Promise<T> {
  const run = mutationQueue.then(async () => {
    const state = await readState();
    const result = await fn(state);
    await writeState(state);
    return result;
  });

  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

function findOrCreateContact(state: z.infer<typeof accountStateSchema>, input: {
  agentId: string;
  provider: string;
  externalUserId?: string;
  username?: string;
  displayName?: string;
}) {
  let contact = state.contacts.find(
    (current) =>
      current.agentId === input.agentId &&
      current.accounts.some(
        (account) =>
          account.provider === input.provider &&
          ((input.externalUserId && account.externalUserId === input.externalUserId) ||
            (input.username && account.username === input.username)),
      ),
  );

  if (!contact) {
    const baseName = input.username || input.displayName || input.externalUserId || 'contact';
    const baseSlug = slugifyContact(baseName);
    let slug = baseSlug;
    let suffix = 2;

    while (state.contacts.some((current) => current.agentId === input.agentId && current.slug === slug)) {
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

  let contactAccount = contact.accounts.find(
    (account) =>
      account.provider === input.provider &&
      ((input.externalUserId && account.externalUserId === input.externalUserId) ||
        (input.username && account.username === input.username)),
  );

    if (!contactAccount) {
      contactAccount = {
        provider: input.provider,
        externalUserId: input.externalUserId,
        username: input.username,
      };
      contact.accounts.push(contactAccount);
    }

  if (input.externalUserId) {
    contactAccount.externalUserId = input.externalUserId;
  }
  if (input.username) {
    contactAccount.username = input.username;
  }
  if (input.displayName) {
    contact.displayName = input.displayName;
  }

  return contact;
}

function findContactBySlug(state: z.infer<typeof accountStateSchema>, agentId: string, slug: string) {
  return state.contacts.find((contact) => contact.agentId === agentId && contact.slug === slug);
}

function mapMessageContact(
  state: z.infer<typeof accountStateSchema>,
  agentId: string,
  accountId: string,
  authorId?: string,
  username?: string,
) {
  const account = state.accounts.find((current) => current.accountId === accountId);
  if (!account) {
    return null;
  }

  return state.contacts.find(
    (contact) =>
      contact.agentId === agentId &&
      contact.accounts.some(
        (contactAccount) =>
          contactAccount.provider === account.provider &&
          ((authorId && contactAccount.externalUserId === authorId) ||
            (username && contactAccount.username === username)),
      ),
  );
}

export async function ensureAccount(input: {
  agentId: string;
  provider: string;
  externalAccountId: string;
  displayName?: string;
  metadata?: Record<string, unknown>;
}) {
  return withStateMutation((state) => {
    const accountId = `${input.agentId}:${input.provider}:${input.externalAccountId}`;
    const existing = state.accounts.find((account) => account.accountId === accountId);

    if (!existing) {
      state.accounts.push({
        accountId,
        agentId: input.agentId,
        provider: input.provider,
        externalAccountId: input.externalAccountId,
        displayName: input.displayName,
        metadata: input.metadata,
      });
    }

    return accountId;
  });
}

export function registerAccountSender(
  accountId: string,
  sender: (input: z.infer<typeof sendInputSchema>) => Promise<{ messageId?: string; channelId?: string }>,
) {
  activeSenders.set(accountId, sender);
}

export function unregisterAccountSender(accountId: string) {
  activeSenders.delete(accountId);
}

export async function ingestInboundMessage(input: z.input<typeof inboundMessageSchema>) {
  const parsed = inboundMessageSchema.parse(input);
  await withStateMutation((state) => {
    const exists = state.messages.find(
      (message) => message.accountId === parsed.accountId && message.messageId === parsed.messageId,
    );
    const account = state.accounts.find((current) => current.accountId === parsed.accountId);

    if (account && (parsed.authorId || parsed.username || parsed.authorName)) {
      findOrCreateContact(state, {
        agentId: parsed.agentId,
        provider: account.provider,
        externalUserId: parsed.authorId,
        username: parsed.username,
        displayName: parsed.authorName,
      });
    }

    if (!exists) {
      state.messages.push({
        messageId: parsed.messageId,
        accountId: parsed.accountId,
        direction: 'inbound',
        channelId: parsed.channelId,
        channelName: parsed.channelName,
        authorId: parsed.authorId,
        authorName: parsed.authorName,
        username: parsed.username,
        content: parsed.content,
        attachments: parsed.attachments,
        unread: true,
        createdAt: parsed.createdAt,
        metadata: parsed.metadata,
      });
    }
  });
}

export async function listAgentAccounts(agentId: string) {
  const state = await readState();
  return state.accounts.filter((account) => account.agentId === agentId);
}

export async function listAgentContacts(agentId: string) {
  const state = await readState();
  return state.contacts.filter((contact) => contact.agentId === agentId);
}

export async function getAgentContact(agentId: string, slug: string) {
  const state = await readState();
  return findContactBySlug(state, agentId, slug) ?? null;
}

export async function upsertAgentContact(input: {
  agentId: string;
  slug: string;
  displayName: string;
  description?: string;
  accounts?: Array<{
    provider: string;
    externalUserId?: string;
    username?: string;
  }>;
}) {
  return withStateMutation((state) => {
    const slug = slugifyContact(input.slug);
    let contact = findContactBySlug(state, input.agentId, slug);

    if (!contact) {
      contact = {
        agentId: input.agentId,
        slug,
        displayName: input.displayName,
        description: input.description,
        accounts: [],
      };
      state.contacts.push(contact);
    }

    contact.displayName = input.displayName;
    contact.description = input.description;

    for (const account of input.accounts ?? []) {
      let contactAccount = contact.accounts.find(
        (current) =>
          current.provider === account.provider &&
          ((account.externalUserId && current.externalUserId === account.externalUserId) ||
            (account.username && current.username === account.username)),
      );

      if (!contactAccount) {
        contactAccount = {
          provider: account.provider,
          externalUserId: account.externalUserId,
          username: account.username,
        };
        contact.accounts.push(contactAccount);
      }

      if (account.externalUserId) {
        contactAccount.externalUserId = account.externalUserId;
      }
      if (account.username) {
        contactAccount.username = account.username;
      }
    }

    return findContactBySlug(state, input.agentId, slug)!;
  });
}

function mapStoredMessage(
  state: z.infer<typeof accountStateSchema>,
  agentId: string,
  message: z.infer<typeof accountMessageSchema>,
) {
  const contact = mapMessageContact(state, agentId, message.accountId, message.authorId, message.username);
  const provider = state.accounts.find((current) => current.accountId === message.accountId)?.provider;

  return {
    ...message,
    provider,
    contactSlug: contact?.slug,
    contactDisplayName: contact?.displayName,
    conversationId: `${provider}:${message.channelId ?? contact?.slug ?? message.authorId ?? message.messageId}`,
  };
}

export async function listMessageConversations(input: z.input<typeof listConversationsInputSchema>) {
  const parsed = listConversationsInputSchema.parse(input);
  const accounts = await listAgentAccounts(parsed.agentId);
  const allowedAccountIds = new Set(
    parsed.provider
      ? accounts
          .filter((account) => account.provider === parsed.provider)
          .map((account) => account.accountId)
      : accounts.map((account) => account.accountId),
  );
  const state = await readState();
  const selectedMessages = state.messages
    .filter((message) => allowedAccountIds.has(message.accountId))
    .filter((message) => (parsed.unread === undefined ? true : message.unread === parsed.unread))
    .map((message) => mapStoredMessage(state, parsed.agentId, message))
    .filter((message) => (parsed.contactSlug ? message.contactSlug === parsed.contactSlug : true))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const conversations = new Map<
    string,
    {
      conversationId: string;
      provider?: string;
      channelId?: string;
      channelName?: string;
      contactSlug?: string;
      contactDisplayName?: string;
      latestMessageAt: string;
      unreadCount: number;
      messages: typeof selectedMessages;
    }
  >();

  for (const message of selectedMessages) {
    const existing = conversations.get(message.conversationId);
    if (existing) {
      existing.messages.push(message);
      existing.latestMessageAt = message.createdAt;
      if (message.unread) {
        existing.unreadCount += 1;
      }
      continue;
    }

    conversations.set(message.conversationId, {
      conversationId: message.conversationId,
      provider: message.provider,
      channelId: message.channelId,
      channelName: message.channelName,
      contactSlug: message.contactSlug,
      contactDisplayName: message.contactDisplayName,
      latestMessageAt: message.createdAt,
      unreadCount: message.unread ? 1 : 0,
      messages: [message],
    });
  }

  const selectedConversations = Array.from(conversations.values())
    .sort((a, b) => new Date(b.latestMessageAt).getTime() - new Date(a.latestMessageAt).getTime())
    .slice(0, parsed.limit)
    .map((conversation) => ({
      ...conversation,
      messages: conversation.messages.slice(-5),
    }));

  const unreadIds = new Set(
    selectedConversations.flatMap((conversation) =>
      conversation.messages.filter((message) => message.unread).map((message) => message.messageId),
    ),
  );

  if (unreadIds.size > 0) {
    await withStateMutation((latestState) => {
      for (const message of latestState.messages) {
        if (allowedAccountIds.has(message.accountId) && unreadIds.has(message.messageId)) {
          message.unread = false;
        }
      }
    });
  }

  return selectedConversations;
}

export async function getMessages(input: z.input<typeof getMessagesInputSchema>) {
  const parsed = getMessagesInputSchema.parse(input);
  const accounts = await listAgentAccounts(parsed.agentId);
  const allowedAccountIds = new Set(accounts.map((account) => account.accountId));
  const state = await readState();
  const selectedMessages = state.messages
    .filter((message) => allowedAccountIds.has(message.accountId))
    .map((message) => mapStoredMessage(state, parsed.agentId, message))
    .filter((message) => message.conversationId === parsed.conversationId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-parsed.limit);

  const unreadIds = new Set(
    selectedMessages.filter((message) => message.unread).map((message) => message.messageId),
  );

  if (unreadIds.size > 0) {
    await withStateMutation((latestState) => {
      for (const message of latestState.messages) {
        if (allowedAccountIds.has(message.accountId) && unreadIds.has(message.messageId)) {
          message.unread = false;
        }
      }
    });
  }

  return selectedMessages;
}

export async function sendAccountMessage(input: z.input<typeof sendInputSchema>) {
  const parsed = sendInputSchema.parse(input);
  const state = await readState();
  const account = state.accounts.find(
    (current) => current.agentId === parsed.agentId && current.provider === parsed.provider,
  );

  if (!account) {
    throw new Error(`Provider not found for agent: ${parsed.provider}`);
  }

  let target = parsed.target;
  const replyToMessageId = parsed.replyToMessageId?.trim() || undefined;
  let repliedMessage = replyToMessageId
    ? state.messages.find(
        (message) => message.messageId === replyToMessageId && message.accountId === account.accountId,
      )
    : undefined;

  if (parsed.contactSlug) {
    const contact = findContactBySlug(state, parsed.agentId, parsed.contactSlug);
    if (!contact) {
      throw new Error(`Contact not found: ${parsed.contactSlug}`);
    }

    const contactAccount = contact.accounts.find((current) => current.provider === account.provider);
    if (!contactAccount) {
      throw new Error(`No ${account.provider} account found for contact: ${parsed.contactSlug}`);
    }

    if (replyToMessageId) {
      target = repliedMessage?.channelId;
      if (!target) {
        throw new Error(`No message context found for reply: ${replyToMessageId}`);
      }
    } else {
      target = contactAccount.externalUserId ?? contactAccount.username;
      if (!target) {
        throw new Error(`No direct identity found for contact: ${parsed.contactSlug}`);
      }
    }
  }

  if (account.provider === 'internal-chat' && replyToMessageId && !repliedMessage) {
    throw new Error(`Unknown internal-chat replyToMessageId: ${replyToMessageId}`);
  }

  if (
    account.provider === 'internal-chat' &&
    replyToMessageId &&
    target &&
    repliedMessage?.channelId &&
    repliedMessage.channelId !== target
  ) {
    throw new Error(
      `replyToMessageId ${replyToMessageId} belongs to channel ${repliedMessage.channelId}, but target ${target} was requested.`,
    );
  }

  const senderKey = account.accountId;
  const sender = activeSenders.get(senderKey);
  if (!sender) {
    throw new Error(`No active sender registered for provider: ${parsed.provider}`);
  }

  const result = await sender({
    ...parsed,
    replyToMessageId,
    target,
  });
  const messageId = result.messageId ?? `out:${Date.now()}`;
  const channelId = result.channelId ?? target;
  const createdAt = new Date().toISOString();

  await withStateMutation((latestState) => {
    latestState.messages.push({
      messageId,
      accountId: account.accountId,
      direction: 'outbound',
      channelId,
      content: parsed.content,
      attachments: [],
      unread: false,
      createdAt,
      metadata: {
        mode: parsed.mode,
        replyToMessageId,
        contactSlug: parsed.contactSlug,
        provider: parsed.provider,
      },
    });
  });

  return {
    success: true,
    messageId,
  };
}

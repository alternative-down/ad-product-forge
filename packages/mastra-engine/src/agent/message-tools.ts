import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import { messageStore } from './message-store';

const upsertContactInputSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  accounts: z
    .array(
      z.object({
        provider: z.string(),
        externalUserId: z.string().optional(),
        username: z.string().optional(),
      }),
    )
    .default([]),
});

const listConversationsInputSchema = z.object({
  provider: z.string().optional(),
  contactSlug: z.string().optional(),
  unread: z.boolean().optional(),
  limit: z.number().int().positive().max(100).default(20),
});

const getMessagesInputSchema = z.object({
  conversationId: z.string(),
  limit: z.number().int().positive().max(200).default(100),
});

const sendMessageInputSchema = z
  .object({
    provider: z.string(),
    target: z.string().optional().describe('Send to a channel, thread, or conversation directly.'),
    contactSlug: z
      .string()
      .optional()
      .describe('Send to a known contact. Without replyToMessageId, the provider will use direct messaging when supported.'),
    content: z.string().min(1),
    replyToMessageId: z
      .string()
      .optional()
      .describe(
        'Optional message id to reply to. Use only a recent messageId from the same conversation. If unsure, omit it and send without reply.',
      ),
  })
  .refine((input) => Number(Boolean(input.target)) + Number(Boolean(input.contactSlug)) === 1, {
    message: 'Provide exactly one of target or contactSlug.',
  });
type ToolMap = {
  list_contacts: Tool;
  get_contact: Tool;
  upsert_contact: Tool;
  list_conversations: Tool;
  get_messages: Tool;
  send_message: Tool;
};

type SimpleTool<TInput> = {
  id: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (input: TInput) => Promise<unknown> | unknown;
};

const createMessageTool = createTool as unknown as <TInput>(tool: SimpleTool<TInput>) => Tool;

export function createExternalAccountTools(agentId: string): ToolMap {
  const listContacts = createMessageTool({
    id: 'list_contacts',
    description: 'List the known contacts registered by this agent.',
    inputSchema: z.object({}),
    execute: async () => {
      const contacts = await messageStore.listAgentContacts(agentId);
      return {
        contacts: contacts.map((contact) => ({
          slug: contact.slug,
          displayName: contact.displayName,
          description: contact.description,
        })),
      };
    },
  });

  const getContact = createMessageTool({
    id: 'get_contact',
    description: 'Get a registered contact by slug, including all known identities across providers.',
    inputSchema: z.object({
      slug: z.string(),
    }),
    execute: async ({ slug }: { slug: string }) => ({
      contact: await messageStore.getAgentContact(agentId, slug),
    }),
  });

  const upsertContact = createMessageTool({
    id: 'upsert_contact',
    description: 'Create or update a contact with a stable slug, free-form description, and known accounts.',
    inputSchema: upsertContactInputSchema,
    execute: async (input: z.infer<typeof upsertContactInputSchema>) => {
      const contact = await messageStore.upsertAgentContact({
        agentId,
        slug: input.slug,
        displayName: input.displayName,
        description: input.description,
        accounts: input.accounts,
      });

      return {
        slug: contact.slug,
        displayName: contact.displayName,
        description: contact.description,
      };
    },
  });

  const listConversations = createMessageTool({
    id: 'list_conversations',
    description:
      'List message conversations from the agent inbox. If unread preview messages are returned, they are automatically marked as read.',
    inputSchema: listConversationsInputSchema,
    execute: async (input: z.infer<typeof listConversationsInputSchema>) => {
      const conversations = await messageStore.listMessageConversations({
        agentId,
        provider: input.provider,
        contactSlug: input.contactSlug,
        unread: input.unread,
        limit: input.limit,
      });

      return {
        conversations: conversations.map((conversation) => ({
          conversationId: conversation.conversationId,
          provider: conversation.provider,
          channelId: conversation.channelId,
          channelName: conversation.channelName,
          contactSlug: conversation.contactSlug,
          contactDisplayName: conversation.contactDisplayName,
          latestMessageAt: conversation.latestMessageAt,
          unreadCount: conversation.unreadCount,
          messages: conversation.messages.map((message) => ({
            messageId: message.messageId,
            provider: message.provider,
            channelId: message.channelId,
            channelName: message.channelName,
            contactSlug: message.contactSlug,
            contactDisplayName: message.contactDisplayName,
            content: message.content,
            createdAt: message.createdAt,
          })),
        })),
      };
    },
  });

  const getMessagesTool = createMessageTool({
    id: 'get_messages',
    description: 'Read the messages from a single conversation. Returned unread messages are automatically marked as read.',
    // TODO: consider also returning a formatted text view for conversation reads, e.g.:
    // [${createdAt}][${provider}] ${contactDisplayName} (${contactSlug}): ${content}
    inputSchema: getMessagesInputSchema,
    execute: async (input: z.infer<typeof getMessagesInputSchema>) => {
      const messages = await messageStore.getMessages({
        agentId,
        conversationId: input.conversationId,
        limit: input.limit,
      });

      return {
        messages: messages.map((message) => ({
          messageId: message.messageId,
          provider: message.provider,
          channelId: message.channelId,
          channelName: message.channelName,
          contactSlug: message.contactSlug,
          contactDisplayName: message.contactDisplayName,
          content: message.content,
          createdAt: message.createdAt,
        })),
      };
    },
  });

  const sendMessage = createMessageTool({
    id: 'send_message',
    description: 'Send a message through one of the external providers owned by this agent.',
    inputSchema: sendMessageInputSchema,
    execute: async (input: z.infer<typeof sendMessageInputSchema>) =>
      messageStore.sendAccountMessage({
        agentId,
        provider: input.provider,
        target: input.target,
        contactSlug: input.contactSlug,
        content: input.content,
        replyToMessageId: input.replyToMessageId,
      }),
  });

  return {
    list_contacts: listContacts,
    get_contact: getContact,
    upsert_contact: upsertContact,
    list_conversations: listConversations,
    get_messages: getMessagesTool,
    send_message: sendMessage,
  };
}

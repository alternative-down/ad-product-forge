import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import {
  getAgentContact,
  getMessages,
  listAgentContacts,
  listMessageConversations,
  sendAccountMessage,
  upsertAgentContact,
} from '../accounts/account-service';

export function createExternalAccountTools(agentId: string) {
  const listContacts = createTool({
    id: 'list_contacts',
    description: 'List the known contacts registered by this agent.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      contacts: z.array(
        z.object({
          slug: z.string(),
          displayName: z.string(),
          description: z.string().optional(),
        }),
      ),
    }),
    execute: async () => {
      const contacts = await listAgentContacts(agentId);
      return {
        contacts: contacts.map((contact) => ({
          slug: contact.slug,
          displayName: contact.displayName,
          description: contact.description,
        })),
      };
    },
  });

  const getContact = createTool({
    id: 'get_contact',
    description: 'Get a registered contact by slug, including all known identities across providers.',
    inputSchema: z.object({
      slug: z.string(),
    }),
    outputSchema: z.object({
      contact: z
        .object({
          slug: z.string(),
          displayName: z.string(),
          description: z.string().optional(),
          accounts: z.array(
            z.object({
              provider: z.string(),
              externalUserId: z.string().optional(),
              username: z.string().optional(),
            }),
          ),
        })
        .nullable(),
    }),
    execute: async ({ slug }) => ({
      contact: await getAgentContact(agentId, slug),
    }),
  });

  const upsertContact = createTool({
    id: 'upsert_contact',
    description: 'Create or update a contact with a stable slug, free-form description, and known accounts.',
    inputSchema: z.object({
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
    }),
    outputSchema: z.object({
      slug: z.string(),
      displayName: z.string(),
      description: z.string().optional(),
    }),
    execute: async (input) => {
      const contact = await upsertAgentContact({
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

  const listConversations = createTool({
    id: 'list_conversations',
    description:
      'List message conversations from the agent inbox. If unread preview messages are returned, they are automatically marked as read.',
    inputSchema: z.object({
      provider: z.string().optional(),
      contactSlug: z.string().optional(),
      unread: z.boolean().optional(),
      limit: z.number().int().positive().max(100).default(20),
    }),
    outputSchema: z.object({
      conversations: z.array(
        z.object({
          conversationId: z.string(),
          provider: z.string().optional(),
          channelId: z.string().optional(),
          channelName: z.string().optional(),
          contactSlug: z.string().optional(),
          contactDisplayName: z.string().optional(),
          latestMessageAt: z.string(),
          unreadCount: z.number(),
          messages: z.array(
            z.object({
              messageId: z.string(),
              provider: z.string().optional(),
              channelId: z.string().optional(),
              channelName: z.string().optional(),
              contactSlug: z.string().optional(),
              contactDisplayName: z.string().optional(),
              content: z.string(),
              createdAt: z.string(),
            }),
          ),
        }),
      ),
    }),
    execute: async (input) => {
      const conversations = await listMessageConversations({
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

  const getMessagesTool = createTool({
    id: 'get_messages',
    description: 'Read the messages from a single conversation. Returned unread messages are automatically marked as read.',
    // TODO: consider also returning a formatted text view for conversation reads, e.g.:
    // [${createdAt}][${provider}] ${contactDisplayName} (${contactSlug}): ${content}
    inputSchema: z.object({
      conversationId: z.string(),
      limit: z.number().int().positive().max(200).default(100),
    }),
    outputSchema: z.object({
      messages: z.array(
        z.object({
          messageId: z.string(),
          provider: z.string().optional(),
          channelId: z.string().optional(),
          channelName: z.string().optional(),
          contactSlug: z.string().optional(),
          contactDisplayName: z.string().optional(),
          content: z.string(),
          createdAt: z.string(),
        }),
      ),
    }),
    execute: async (input) => {
      const messages = await getMessages({
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

  const sendMessage = createTool({
    id: 'send_message',
    description: 'Send a message through one of the external providers owned by this agent.',
    inputSchema: z
      .object({
        provider: z.string(),
        target: z.string().optional().describe('Use this to send a message to a channel, thread, or conversation directly.'),
        contactSlug: z.string().optional().describe('Use this to send a message to a known contact. Without replyToMessageId, the provider will use direct messaging when supported.'),
        content: z.string().min(1),
        replyToMessageId: z
          .string()
          .optional()
          .describe(
            'Optional message id to reply to. Use only a messageId returned by recent message tools for the same conversation. Prefer the most recent relevant message. If you are not sure, omit this field and send without reply.',
          ),
        mode: z.enum(['send', 'reply']).default('send'),
      })
      .refine((input) => Number(Boolean(input.target)) + Number(Boolean(input.contactSlug)) === 1, {
        message: 'Provide exactly one of target or contactSlug.',
      }),
    outputSchema: z.object({
      success: z.boolean(),
      messageId: z.string(),
    }),
    execute: async (input) =>
      sendAccountMessage({
        agentId,
        provider: input.provider,
        target: input.target,
        contactSlug: input.contactSlug,
        content: input.content,
        replyToMessageId: input.replyToMessageId,
        mode: input.mode,
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

import { z } from 'zod';

import type {
  CommunicationConversationView,
  CommunicationModule,
} from './communication.js';
import { createTool, type ToolsInput } from './tools.js';

const MAX_RETURNED_CONVERSATIONS = 20;
const MAX_RETURNED_MESSAGES_PER_CONVERSATION = 3;
const MAX_MESSAGE_CONTENT_CHARS = 280;
const MAX_PARTICIPANTS = 8;

const listContactsInputSchema = z.object({
  filter: z
    .enum(['self', 'others', 'all'])
    .optional()
    .describe("Which contacts to list. Use 'others' for the contacts you registered, 'self' for your own identities, or 'all' for both."),
});

const upsertContactInputSchema = z.object({
  slug: z.string().describe('A stable slug to identify this contact later.'),
  displayName: z.string().describe('The human-readable name of the contact.'),
  description: z.string().optional().describe('Optional notes or description about this contact.'),
});

const listConversationsInputSchema = z.object({
  provider: z
    .string()
    .optional()
    .describe('Optional provider filter. Leave empty to list conversations from every provider that supports this tool.'),
  unread: z
    .boolean()
    .optional()
    .describe('Set this to true if you only want conversations with unread messages.'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .default(20)
    .describe('Maximum number of conversations to request from each provider.'),
});

const getMessagesInputSchema = z.object({
  provider: z
    .string()
    .min(1)
    .describe('Which provider the conversation belongs to, such as internal-chat, email, or discord.'),
  targetKey: z
    .string()
    .min(1)
    .describe('The targetKey of the conversation you want to read. Use the same targetKey returned by list_conversations, or another key that this provider accepts.'),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .default(100)
    .describe('Maximum number of recent messages to return.'),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('How many most-recent messages to skip before returning results. Use this to page through older messages.'),
  query: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Optional text filter. Only messages containing this text will be returned.'),
  dateFrom: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Optional start of the time window. Use an ISO date or date-time, such as 2026-04-01 or 2026-04-01T09:00:00Z.'),
  dateTo: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Optional end of the time window. Use an ISO date or date-time, such as 2026-04-01 or 2026-04-01T18:00:00Z.'),
});

const sendMessageInputSchema = z.object({
  provider: z
    .string()
    .min(1)
    .describe('Which communication provider to use, such as internal-chat, email, or discord.'),
  targetKey: z
    .string()
    .describe('Who or where to send the message in that provider. Use the targetKey returned by list_contacts or list_conversations. Examples: an internal-chat agentId, slug, or group id, an email address, or a Discord username/channel id.'),
  content: z
    .string()
    .min(1)
    .describe('The exact message text to actually deliver to the recipient. Writing that text outside this tool does not send anything.'),
  attachments: z
    .array(z.string())
    .optional()
    .describe('Optional workspace file paths to send with the message. Omit this field entirely when there are no attachments. When sending files, pass an array of string paths.'),
});

export function createExternalAccountTools(communication: CommunicationModule): ToolsInput {
  return {
    list_contacts: createTool({
      id: 'list_contacts',
      description:
        "List your contacts. Each contact includes the targetKey you should use with send_message, plus a slug in metadata when the provider also exposes a human-friendly identifier.",
      inputSchema: listContactsInputSchema,
      execute: async (input) => {
        try {
          return await communication.listContacts(input.filter ?? 'others');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Try again in a moment. If the problem persists, verify the communication store is available.',
          };
        }
      },
    }),
    upsert_contact: createTool({
      id: 'upsert_contact',
      description:
        'Create a new contact or update an existing one. Returns the saved slug, display name, and description.',
      inputSchema: upsertContactInputSchema,
      execute: async (input) => {
        try {
          const contact = await communication.upsertContact({
            slug: input.slug,
            displayName: input.displayName,
            description: input.description ?? undefined,
          });

          return {
            valid: true,
            slug: contact.slug,
            displayName: contact.displayName,
            description: contact.description,
          };
        } catch (error) {
          if (error instanceof Error) {
            return {
              valid: false,
              error: error.message,
              hint: 'Verify the slug is valid and does not contain special characters. The slug should be a stable identifier (e.g., "john-doe" or "john@example.com").',
            };
          }

          return {
            valid: false,
            error: 'An unknown error occurred while upserting the contact',
            hint: 'Verify the slug and displayName are valid.',
          };
        }
      },
    }),
    list_conversations: createTool({
      id: 'list_conversations',
      description:
        'List conversations you can continue through the communication tools. Returns the provider and targetKey you need to read messages or send a reply, plus conversation details when available.',
      inputSchema: listConversationsInputSchema,
      execute: async (input) => {
        try {
          const conversations = await communication.listConversations({
            provider: input.provider ?? undefined,
            unread: input.unread ?? undefined,
            limit: Math.min(input.limit ?? 20, MAX_RETURNED_CONVERSATIONS),
          });

          return {
            conversations: conversations.map((conversation) => summarizeConversation(conversation)),
            returnedConversationCount: conversations.length,
            messagePreviewLimit: MAX_RETURNED_MESSAGES_PER_CONVERSATION,
            messageContentCharLimit: MAX_MESSAGE_CONTENT_CHARS,
            note:
              'This tool returns a lightweight conversation preview. If you need more detail for one conversation, call get_messages for that specific provider and targetKey.',
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const hint = message.includes('Provider does not support listing conversations')
            ? 'This provider does not support listing conversations through the communication module.'
            : message.includes('Provider not available')
              ? 'Use a provider configured for this agent.'
              : 'Try again in a moment. If the problem persists, verify the selected provider is available.';

          return {
            valid: false,
            error: message,
            hint,
          };
        }
      },
    }),
    get_messages: createTool({
      id: 'get_messages',
      description:
        'Read recent messages from one conversation. Use the provider and targetKey of the conversation you want to inspect. Returns the messages from that conversation.',
      inputSchema: getMessagesInputSchema,
      execute: async (input) => {
        try {
          return {
            messages: await communication.getMessages({
              provider: input.provider,
              targetKey: input.targetKey,
              limit: input.limit ?? 100,
              offset: input.offset ?? 0,
              query: input.query ?? undefined,
              dateFrom: input.dateFrom ?? undefined,
              dateTo: input.dateTo ?? undefined,
            }),
          };
        } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes('Provider not available')) {
              return {
                valid: false,
                error: error.message,
                hint: 'Use a provider configured for this agent.',
              };
            }

            if (error.message.includes('does not support reading messages')) {
              return {
                valid: false,
                error: error.message,
                hint: 'This provider does not support reading conversation history through the communication module.',
              };
            }

            if (error.message.includes('not found') || error.message.includes('does not exist')) {
              return {
                valid: false,
                error: error.message,
                hint: 'The targetKey may not exist for this provider. Use list_conversations when supported or verify the provider-specific key.',
              };
            }

            return {
              valid: false,
              error: error.message,
              hint: 'Verify the provider and targetKey are valid for that provider.',
            };
          }

          return {
            valid: false,
            error: 'An unknown error occurred while fetching messages',
            hint: 'Verify the provider and targetKey are correct and try again.',
          };
        }
      },
    }),
    send_message: createTool({
      id: 'send_message',
      description:
        'Actually deliver a message through a provider. Use this both to continue an existing conversation and to start a new one when that provider supports it. Writing plain text in your response does not send anything. A message is only delivered when this tool is called successfully. The result confirms delivery with provider, targetKey, and messageId, and may also include unread messages that were still pending in that conversation.',
      inputSchema: sendMessageInputSchema,
      execute: async (input) => {
        try {
          return await communication.sendMessage({
            provider: input.provider,
            targetKey: input.targetKey,
            content: input.content,
            attachments: input.attachments,
          });
        } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes('Provider not available')) {
              return {
                valid: false,
                error: error.message,
                hint: 'Use a provider configured for this agent, such as internal-chat, email, or discord.',
              };
            }

            if (error.message.includes('does not support')) {
              return {
                valid: false,
                error: error.message,
                hint: 'This provider does not support sending to this kind of targetKey. Use a key that the provider accepts.',
              };
            }

            if (error.message.includes('Attachment path is outside the workspace')) {
              return {
                valid: false,
                error: error.message,
                hint: 'Use only attachment paths inside the agent workspace.',
              };
            }

            if (error.message.includes('ENOENT')) {
              return {
                valid: false,
                error: error.message,
                hint: 'One of the attachment paths does not exist in the workspace.',
              };
            }

            return {
              valid: false,
              error: error.message,
              hint: 'Verify the provider and targetKey. The targetKey must be valid for that specific provider.',
            };
          }

          return {
            valid: false,
            error: 'An unknown error occurred while sending the message',
            hint: 'Verify the provider and targetKey are correct for the selected provider.',
          };
        }
      },
    }),
  };
}

function summarizeConversation(conversation: CommunicationConversationView) {
  const recentMessages = conversation.messages.slice(-MAX_RETURNED_MESSAGES_PER_CONVERSATION).map((message) => ({
    messageId: message.messageId,
    createdAt: message.createdAt,
    unread: message.unread,
    authorDisplayName: message.authorDisplayName,
    content: truncateText(message.content, MAX_MESSAGE_CONTENT_CHARS),
    attachmentCount: message.attachments.length,
  }));

  return {
    provider: conversation.provider,
    targetKey: conversation.targetKey,
    latestMessageAt: conversation.latestMessageAt,
    unreadCount: conversation.unreadCount,
    name: conversation.name,
    participants: conversation.participants?.slice(0, MAX_PARTICIPANTS) ?? [],
    participantCount: conversation.participants?.length ?? 0,
    messages: recentMessages,
    returnedMessageCount: recentMessages.length,
    totalMessageCount: conversation.messages.length,
    hasMoreMessages: conversation.messages.length > recentMessages.length,
    hasMoreParticipants: (conversation.participants?.length ?? 0) > MAX_PARTICIPANTS,
  };
}

function truncateText(text: string, maxChars: number) {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars - 1)}…`;
}

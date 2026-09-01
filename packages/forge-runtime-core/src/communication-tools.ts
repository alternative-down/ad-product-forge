import { z } from 'zod';

import type { CommunicationConversationView, CommunicationModule } from './communication.js';
import { errorMsg } from './error-formatting.js';
import { createTool, type ToolsInput } from './tools.js';

const MAX_RETURNED_CONVERSATIONS = 20;
const MAX_RETURNED_MESSAGES_PER_CONVERSATION = 3;
const MAX_MESSAGE_CONTENT_CHARS = 280;
const MAX_PARTICIPANTS = 8;

// ─── Error handling (Phase 11 of #5887 / L#NN-50 #12 family) ────────────────

/**
 * A typed matcher for selecting a contextual hint based on the thrown error.
 * Each tool may declare an array of these at module scope so they are
 * individually testable and discoverable (rather than buried in inline
 * `if (error.message.includes(...))` ladders — see #5887 Foco 3 for the
 * long-term fix that requires typed errors in `CommunicationModule`).
 */
export type ErrorMatcher = {
  /** Human-readable label describing what this matcher covers. */
  label: string;
  /** Predicate selecting which errors this matcher applies to. */
  test: (error: Error) => boolean;
  /** Hint returned to the caller when this matcher matches. */
  hint: string;
};

/** Standard error return shape used by all 5 communication tools. */
type ToolError = { valid: false; error: string; hint: string };

/**
 * Builds the standard `{ valid: false, error, hint }` return shape.
 *
 * Walks `matchers` first; the first matcher whose `test` returns true
 * contributes its `hint`. Falls back to `fallbackHint` when no matcher
 * matches or the thrown value is not an `Error` instance.
 *
 * Uses `errorMsg` from `@forge-runtime/core` so non-Error throws are
 * rendered with `JSON.stringify` (string-passthrough otherwise) instead
 * of the unsafe `error.message` access.
 */
function buildToolError(
  error: unknown,
  fallbackHint: string,
  matchers?: ReadonlyArray<ErrorMatcher>,
): ToolError {
  if (error instanceof Error && matchers) {
    for (const matcher of matchers) {
      if (matcher.test(error)) {
        return { valid: false, error: errorMsg(error), hint: matcher.hint };
      }
    }
  }
  return { valid: false, error: errorMsg(error), hint: fallbackHint };
}

/** Matchers for `get_messages` errors. Ordered most-specific first. */
const GET_MESSAGES_ERROR_MATCHERS: ReadonlyArray<ErrorMatcher> = [
  {
    label: 'Provider not available',
    test: (e) => e.message.includes('Provider not available'),
    hint: 'Use a provider configured for this agent.',
  },
  {
    label: 'Provider does not support reading',
    test: (e) => e.message.includes('does not support reading messages'),
    hint: 'This provider does not support reading conversation history.',
  },
  {
    label: 'Target not found',
    test: (e) => e.message.includes('not found') || e.message.includes('does not exist'),
    hint: 'The targetKey may not exist for this provider. Use list_conversations to find valid conversations.',
  },
];

/** Matchers for `send_message` errors. Ordered most-specific first. */
const SEND_MESSAGE_ERROR_MATCHERS: ReadonlyArray<ErrorMatcher> = [
  {
    label: 'Provider not available',
    test: (e) => e.message.includes('Provider not available'),
    hint: 'Use a provider configured for this agent, such as internal-chat, email, or discord.',
  },
  {
    label: 'Provider does not support',
    test: (e) => e.message.includes('does not support'),
    hint: 'This provider does not support sending to this kind of targetKey. Use a key that the provider accepts.',
  },
  {
    label: 'Attachment path outside workspace',
    test: (e) => e.message.includes('Attachment path is outside the workspace'),
    hint: 'Attachment paths must point inside the workspace. Use a relative path or a path under the workspace root.',
  },
  {
    label: 'ENOENT (attachment missing)',
    test: (e) => e.message.includes('ENOENT'),
    hint: 'An attachment path does not exist on disk. Verify the file path and try again.',
  },
];

// Input Schemas
const listContactsInputSchema = z.object({
  filter: z
    .enum(['self', 'others', 'all'])
    .optional()
    .describe("Contact set: 'self', 'others', or 'all'."),
});

const upsertContactInputSchema = z.object({
  slug: z.string().describe('Stable contact slug.'),
  displayName: z.string().describe('Contact display name.'),
  description: z.string().optional().describe('Optional contact note.'),
});

const listConversationsInputSchema = z.object({
  provider: z.string().optional().describe('Optional provider filter.'),
  unread: z.boolean().optional().describe('Only unread conversations.'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .default(20)
    .describe('Max conversations per provider.'),
});

const getMessagesInputSchema = z.object({
  provider: z.string().min(1).describe('Conversation provider.'),
  targetKey: z.string().min(1).describe('Conversation target key.'),
  limit: z.number().int().positive().max(200).default(100).describe('Max messages to return.'),
  offset: z.number().int().min(0).default(0).describe('How many recent messages to skip.'),
  query: z.string().trim().min(1).optional().describe('Optional text filter.'),
  dateFrom: z.string().trim().min(1).optional().describe('Optional ISO start date/time.'),
  dateTo: z.string().trim().min(1).optional().describe('Optional ISO end date/time.'),
});

const sendMessageInputSchema = z.object({
  provider: z.string().min(1).describe('Message provider.'),
  targetKey: z.string().describe('Provider target key.'),
  content: z.string().min(1).describe('Message text to send.'),
  attachments: z.array(z.string()).optional().describe('Optional attachment file paths.'),
});

export function createExternalAccountTools(communication: CommunicationModule): ToolsInput {
  return {
    list_contacts: createTool({
      id: 'list_contacts',
      description:
        'List your contacts. Each contact includes the targetKey you should use with send_message, plus a slug in metadata when the provider also exposes a human-friendly identifier. Returns an array of contacts or an error object.',
      inputSchema: listContactsInputSchema,
      execute: async (input) => {
        try {
          return {
            valid: true as const,
            contacts: await communication.listContacts(input.filter ?? 'others'),
          };
        } catch (error) {
          return buildToolError(
            error,
            'Try again in a moment. If the problem persists, verify the communication store is available.',
          );
        }
      },
    }),

    upsert_contact: createTool({
      id: 'upsert_contact',
      description:
        'Register or update a contact so you can send them messages later. On success, returns the created or updated contact with its slug, displayName, and description.',
      inputSchema: upsertContactInputSchema,
      execute: async (input) => {
        try {
          const contact = await communication.upsertContact({
            slug: input.slug,
            displayName: input.displayName,
            description: input.description ?? undefined,
          });

          return {
            valid: true as const,
            slug: contact.slug,
            displayName: contact.displayName,
            description: contact.description,
          };
        } catch (error) {
          return buildToolError(
            error,
            'Verify the slug and displayName are valid.',
            [
              {
                label: 'Slug validation',
                test: (e) => e instanceof Error,
                hint: 'Verify the slug is valid and does not contain special characters. The slug should be a stable identifier (e.g., "john-doe" or "john@example.com").',
              },
            ],
          );
        }
      },
    }),

    list_conversations: createTool({
      id: 'list_conversations',
      description:
        'List your recent conversations across all providers, or filter by provider. Each conversation shows participants and a preview of the most recent messages. Returns a summary of conversations with message previews.',
      inputSchema: listConversationsInputSchema,
      execute: async (input) => {
        try {
          const conversations = await communication.listConversations({
            provider: input.provider ?? undefined,
            unread: input.unread ?? undefined,
            limit: Math.min(input.limit ?? MAX_RETURNED_CONVERSATIONS, MAX_RETURNED_CONVERSATIONS),
          });

          return {
            conversations: conversations.map(summarizeConversation),
            returnedConversationCount: conversations.length,
            messagePreviewLimit: MAX_RETURNED_MESSAGES_PER_CONVERSATION,
            messageContentCharLimit: MAX_MESSAGE_CONTENT_CHARS,
            note: 'This tool returns a lightweight conversation preview. If you need more detail for one conversation, call get_messages for that specific provider and targetKey.',
          };
        } catch (error) {
          return buildToolError(
            error,
            'Try again in a moment. If the problem persists, verify the selected provider is available.',
          );
        }
      },
    }),

    get_messages: createTool({
      id: 'get_messages',
      description:
        'Read recent messages from one conversation. Returns messages ordered by creation time, each with messageId, content, author, and timestamp. Use provider and targetKey from list_conversations.',
      inputSchema: getMessagesInputSchema,
      execute: async (input) => {
        try {
          return {
            valid: true as const,
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
          return buildToolError(
            error,
            'Verify the provider and targetKey are valid.',
            GET_MESSAGES_ERROR_MATCHERS,
          );
        }
      },
    }),

    send_message: createTool({
      id: 'send_message',
      description:
        'Send a message through a provider. The message is only delivered when this tool is called successfully and returns a messageId. Writing plain text in your response does not send anything.',
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
          return buildToolError(
            error,
            'Verify the provider and targetKey are correct.',
            SEND_MESSAGE_ERROR_MATCHERS,
          );
        }
      },
    }),
  };
}

function summarizeConversation(conversation: CommunicationConversationView): {
  provider: string;
  targetKey: string;
  name?: string;
  participants: string[];
  latestMessageAt: string;
  unreadCount: number;
  messages: Array<{
    messageId: string;
    createdAt: string;
    unread: boolean;
    authorDisplayName?: string;
    content: string;
    attachmentCount: number;
  }>;
  returnedMessageCount: number;
  totalMessageCount: number;
  hasMoreMessages: boolean;
  hasMoreParticipants: boolean;
} {
  const recentMessages = conversation.messages
    .slice(-MAX_RETURNED_MESSAGES_PER_CONVERSATION)
    .map((message) => ({
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
    name: conversation.name,
    participants: conversation.participants?.slice(0, MAX_PARTICIPANTS) ?? [],
    latestMessageAt: conversation.latestMessageAt,
    unreadCount: conversation.unreadCount,
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
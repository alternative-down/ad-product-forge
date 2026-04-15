import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CommunicationModule } from '../module';
import type { CommunicationConversationView } from '../provider-types';

const MAX_RETURNED_CONVERSATIONS = 20;
const MAX_RETURNED_MESSAGES_PER_CONVERSATION = 3;
const MAX_MESSAGE_CONTENT_CHARS = 280;
const MAX_PARTICIPANTS = 8;

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

export function createListConversationsTool(communication: CommunicationModule) {
  function truncateText(text: string, maxChars: number) {
    if (text.length <= maxChars) {
      return text;
    }

    return `${text.slice(0, maxChars - 1)}…`;
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

  return createTool({
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
  });
}

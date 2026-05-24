import path from 'node:path';
import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../../agents/agent-runner-error-formatting';
import { createClient } from '@libsql/client';
import {
  buildThreadToolInvocationParts,
  collectConversationParticipants,
  mergeToolLogMessages,
} from './helpers';
import {
  LibsqlConversationStore,
  toMastraSafeIdentifier,
  type CommunicationMessageView,
} from '@forge-runtime/core';
import { getInternalAgentRegistry } from '../../agents/internal-agent-registry';
import type { InternalChatService } from '../../communication/internal-chat-service';
import type { ConversationListingOutput } from '../../communication/internal-chat-conversation-listing';

// Mirror of MessageListItem (internal to internal-chat-conversation-listing, not exported)
interface LocalMessageListItem {
  messageId: string;
  provider: string;
  authorId: string;
  targetKey: string;
  content: string;
  attachments: unknown[];
  unread: boolean;
  createdAt: string;
  authorDisplayName: string;
  replyToMessageId: string | null;
}
import type { ConversationParticipant } from '../../communication/internal-chat-listing-types';
type ClosableLibsqlClient = ReturnType<typeof createClient> & {
  close?: () => void | Promise<void>;
};

const RECENT_CONVERSATION_LIMIT = 10;

// shared utility — imported from utils/async

async function closeLibsqlClient(client: ClosableLibsqlClient) {
  await client.close?.();
}

async function listRecentConversations(
  workspaceBasePath: string,
  internalChat: InternalChatService,
  agentId: string,
  agentName: string,
) {
  const [externalConversations, internalConversations] = await Promise.all([
    listRecentExternalConversations(workspaceBasePath, agentId, agentName),
    listRecentInternalChatConversations(internalChat, agentId, agentName),
  ]);

  return [...internalConversations, ...externalConversations]
    .sort((left, right) => Number(right.updatedAt) - Number(left.updatedAt))
    .slice(0, RECENT_CONVERSATION_LIMIT);
}

async function listRecentExternalConversations(
  _workspaceBasePath: string,
  _agentId: string,
  _agentName: string,
) {
  const runtime = getInternalAgentRegistry().get(_agentId)?.runtime;

  if (!runtime) {
    return [];
  }

  try {
    const rows = await runtime.communication.listConversations({
      limit: RECENT_CONVERSATION_LIMIT,
    });

    return rows
      .filter(
        (conversation): conversation is (typeof rows)[number] =>
          conversation.provider !== 'internal-chat',
      )
      .map((conversation: (typeof rows)[number]) => {
        const participants = collectConversationParticipants({
          name: conversation.name,
          participants: conversation.participants,
          messages: conversation.messages.map((message: CommunicationMessageView) => ({
            authorDisplayName: message.authorDisplayName,
          })),
        });

        return {
          conversationId: `${conversation.provider}:${conversation.targetKey}`,
          conversationKey: conversation.targetKey,
          provider: conversation.provider,
          type: participants.length > 2 ? 'group' : 'dm',
          name: conversation.name ?? undefined,
          participants,
          updatedAt: Date.parse(conversation.latestMessageAt) || 0,
          messages: conversation.messages.map((message: CommunicationMessageView) => ({
            messageId: message.messageId,
            content: message.content,
            unread: message.unread,
            authorDisplayName: message.authorDisplayName ?? 'Unknown author',
            createdAt: Date.parse(message.createdAt) || 0,
          })),
        };
      });
  } catch (err) {
    forgeDebug({
      scope: 'admin-read-model',
      level: 'error',
      message: 'Failed to load external conversations',
      context: { agentId: _agentId, err: errorMsg(err) },
    });
    return [];
  }
}

async function listRecentInternalChatConversations(
  internalChat: InternalChatService,
  agentId: string,
  agentName: string,
) {
  try {
    const rows = await internalChat.listRecentConversations(agentId, RECENT_CONVERSATION_LIMIT);

    return await Promise.all(
      rows.map(async (conversation) => {
        const c = conversation as ConversationListingOutput;
        const internalConversation = await internalChat.getConversationForAgent(
          agentId,
          c.targetKey,
        );
        const groupParticipants = await listInternalChatGroupParticipants(
          internalChat,
          agentId,
          c.targetKey,
        );
        const participants = collectConversationParticipants({
          name: c.name,
          participants: groupParticipants.length > 0 ? groupParticipants : c.participants,
          messages: c.messages.map((message: LocalMessageListItem) => ({
            authorDisplayName: message.authorDisplayName ?? agentName,
          })),
        });

        return {
          conversationId: c.targetKey,
          conversationKey: c.targetKey,
          provider: c.provider,
          type: internalConversation?.type === 'group' ? 'group' : 'dm',
          name: c.name ?? undefined,
          participants,
          updatedAt: Date.parse(c.latestMessageAt) || 0,
          messages: c.messages.map((message: LocalMessageListItem) => ({
            messageId: message.messageId,
            content: message.content,
            unread: message.unread,
            authorDisplayName: message.authorDisplayName ?? agentName,
            createdAt: Date.parse(message.createdAt) || 0,
          })),
        };
      }),
    );
  } catch (err) {
    forgeDebug({
      scope: 'admin-read-model',
      level: 'error',
      message: 'Failed to load internal chat conversations',
      context: { agentId, err: errorMsg(err) },
    });
    return [];
  }
}

async function listInternalChatGroupParticipants(
  internalChat: InternalChatService,
  _agentId: string,
  conversationKey: string,
) {
  try {
    const conversation = await internalChat.getConversationForAgent(_agentId, conversationKey);

    if (conversation === null || conversation === undefined || conversation.type !== 'group') {
      return [];
    }

    const members = (await (internalChat as any).listGroupMembersOrDmPeers(
      _agentId,
      conversationKey,
    )) as ConversationParticipant[];
    return members.map((member) => member.displayName ?? 'Unknown participant');
  } catch (err) {
    forgeDebug({
      scope: 'admin-read-model',
      level: 'error',
      message: 'Failed to load group participants',
      context: { conversationKey, err: errorMsg(err) },
    });
    return [];
  }
}

async function listThreadMessages(
  workspaceBasePath: string,
  agentId: string,
  input: {
    page: number;
    perPage: number;
    threadId?: string;
    tablePrefix?: string;
  },
) {
  try {
    const threadId = input.threadId ?? toMastraSafeIdentifier(agentId);
    const tablePrefix = input.tablePrefix ?? toMastraSafeIdentifier(agentId);
    const agentDatabasePath = path.resolve(workspaceBasePath, agentId, 'database.db');
    const client: ClosableLibsqlClient = createClient({
      url: `file:${agentDatabasePath}`,
    });
    client.execute('PRAGMA foreign_keys = ON');
    const conversationStore = new LibsqlConversationStore({
      client,
      tablePrefix,
    });

    try {
      const messages = await conversationStore.listMessages({
        threadId,
        limit: input.perPage * (input.page + 1) + 1,
        order: 'desc',
      });
      const pageStart = input.page * input.perPage;
      const pageEnd = pageStart + input.perPage;
      const pagedMessages = messages.slice(pageStart, pageEnd);
      const mergedMessages = mergeToolLogMessages([...pagedMessages].reverse() as any[]);

      return {
        items: mergedMessages.reverse().map((message) => ({
          id: message.id,
          role: message.role,
          createdAt: new Date(message.createdAt).getTime(),
          threadId: message.threadId,
          resourceId: threadId,
          type: null,
          content: {
            parts: [
              ...(message.parts ?? []).map((part) =>
                (part.type as string) === 'text' || (part.type as string) === 'reasoning'
                  ? {
                      type: part.type,
                      text: part.text,
                    }
                  : part,
              ),
              ...buildThreadToolInvocationParts(message.metadata),
            ],
            ...(Array.isArray(message.metadata?.toolInvocations)
              ? {
                  toolInvocations: message.metadata.toolInvocations,
                }
              : {}),
          },
        })),
        hasMore: messages.length > pageEnd,
      };
    } finally {
      await closeLibsqlClient(client);
    }
  } catch (err) {
    forgeDebug({
      scope: 'admin-read-model',
      level: 'error',
      message: 'Failed to load recent thread messages',
      context: { agentId, err: errorMsg(err) },
    });
    return {
      items: [],
      hasMore: false,
    };
  }
}

export {
  closeLibsqlClient,
  listRecentConversations,
  // fallow-ignore-next-line unused-export
  listRecentExternalConversations,
  // fallow-ignore-next-line unused-export
  listRecentInternalChatConversations,
  // fallow-ignore-next-line unused-export
  listInternalChatGroupParticipants,
  listThreadMessages,

  ClosableLibsqlClient,};

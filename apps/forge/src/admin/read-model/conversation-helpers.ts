import path from 'node:path';
import { forgeDebug } from '@forge-runtime/core';
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

async function listRecentExternalConversations(_workspaceBasePath: string, _agentId: string, _agentName: string) {
  const runtime = getInternalAgentRegistry().get(_agentId)?.runtime;

  if (!runtime) {
    return [];
  }

  try {
    const rows = await runtime.communication.listConversations({
      limit: RECENT_CONVERSATION_LIMIT,
    });

    return rows
      .filter((conversation): conversation is (typeof rows)[number] => conversation.provider !== 'internal-chat')
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
    forgeDebug({ scope: 'admin-read-model', level: 'error', message: 'Failed to load external conversations', context: { agentId: _agentId, err: err instanceof Error ? err.message : String(err) } });
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

    return await Promise.all(rows.map(async (conversation) => {
      const internalConversation = await internalChat.getConversationForAgent(agentId, (conversation as any).targetKey);
      const groupParticipants = await listInternalChatGroupParticipants(internalChat, agentId, (conversation as any).targetKey);
      const participants = collectConversationParticipants({
        name: (conversation as any).name,
        participants: groupParticipants.length > 0 ? groupParticipants : (conversation as any).participants,
        messages: (conversation as any).messages.map((message: any) => ({
          authorDisplayName: message.authorDisplayName ?? agentName,
        })),
      });

      return {
        conversationId: (conversation as any).targetKey,
        conversationKey: (conversation as any).targetKey,
        provider: (conversation as any).provider,
        type: internalConversation?.type === 'group' ? 'group' : 'dm',
        name: (conversation as any).name ?? undefined,
        participants,
        updatedAt: Date.parse((conversation as any).latestMessageAt) || 0,
        messages: (conversation as any).messages.map((message: any) => ({
          messageId: message.messageId,
          content: message.content,
          unread: message.unread,
          authorDisplayName: message.authorDisplayName ?? agentName,
          createdAt: Date.parse(message.createdAt) || 0,
        })),
      };
    }));
  } catch (err) {
    forgeDebug({ scope: 'admin-read-model', level: 'error', message: 'Failed to load internal chat conversations', context: { agentId, err: err instanceof Error ? err.message : String(err) } });
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

    return (conversation as any).participants.map((participant: any) => participant.displayName ?? 'Unknown participant');
  } catch (err) {
    forgeDebug({ scope: 'admin-read-model', level: 'error', message: 'Failed to load group participants', context: { conversationKey, err: err instanceof Error ? err.message : String(err) } });
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
        limit: (input.perPage * (input.page + 1)) + 1,
        order: 'desc',
      });
      const pageStart = input.page * input.perPage;
      const pageEnd = pageStart + input.perPage;
      const pagedMessages = messages.slice(pageStart, pageEnd);
      const mergedMessages = mergeToolLogMessages([...pagedMessages].reverse() as any[]);

      return {
        items: mergedMessages
        .reverse()
        .map((message) => ({
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
                  : part),
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
    forgeDebug({ scope: 'admin-read-model', level: 'error', message: 'Failed to load recent thread messages', context: { agentId, err: err instanceof Error ? err.message : String(err) } });
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
};
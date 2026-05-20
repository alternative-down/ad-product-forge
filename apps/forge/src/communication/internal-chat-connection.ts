import { and, eq, isNull } from 'drizzle-orm';

import type { CommunicationFile } from '@forge-runtime/core';
import { forgeDebug } from '@forge-runtime/core';

import type { Database } from '../database/schema';
import {
  internalChatAccounts,
  internalChatConversations,
  internalChatMessageReads,
  internalChatMessages,
} from '../database/schema';
import type {
  InternalChatGroupMember,
  InternalChatGroupParticipant,
} from './internal-chat-helpers';
import { buildGroupMetadata } from './internal-chat-helpers';

export interface InternalChatHandler {
  (message: InternalChatDeliveryMessage): Promise<void>;
}

export interface InternalChatDeliveryMessage {
  targetKey: string;
  messageId: string;
  conversationName?: string;
  authorId: string;
  authorDisplayName: string;
  authorUsername: string;
  content: string;
  attachments: CommunicationFile[];
  createdAt: string;
  metadata: {
    conversationType: 'dm' | 'group';
    groupMembers?: InternalChatGroupMember[];
  };
}

export interface InternalChatConnection {
  onReceiveMessage(agentId: string, handler: InternalChatHandler): void;
  clearHandler(agentId: string, handler?: InternalChatHandler): void;
  /**
   * Synchronously dispatches `message` to the registered handler for `agentId`.
   * Returns true if a handler was found and called; false otherwise.
   */
  deliverMessage(agentId: string, message: InternalChatDeliveryMessage): boolean;
  /**
   * Alias of deliverMessage for single-agent direct delivery.
   * Returns true if a handler was found and called; false otherwise.
   */
  deliverToHandler(agentId: string, message: InternalChatDeliveryMessage): boolean;
  /**
   * Delivers a message to all participants who have a registered handler,
   * optionally excluding one account (e.g., the sender).
   * Returns the array of agentIds that received the message.
   */
  deliverToParticipants(params: {
    participants: InternalChatGroupParticipant[];
    conversation: { id: string; name: string; type: 'dm' | 'group' };
    messageId: string;
    author: { id: string; displayName: string; slug: string };
    content: string;
    attachments: CommunicationFile[];
    createdAt: string;
    excludeAccountId?: string;
  }): string[];
}

function createConnectionImpl(
  db: Database,
  deps: {
    readMessageAttachments(messageId: string): Promise<CommunicationFile[]>;
    getRequiredAgentAccount(agentId: string): Promise<{ id: string }>;
    listGroupMembersOrDmPeers(
      agentId: string,
      conversationId: string,
    ): Promise<InternalChatGroupParticipant[]>;
  },
): InternalChatConnection {
  const handlers = new Map<string, InternalChatHandler>();

  function onReceiveMessage(agentId: string, handler: InternalChatHandler) {
    const hadHandler = handlers.has(agentId);
    handlers.set(agentId, handler);

    if (hadHandler) {
      return;
    }

    void replayUnreadMessages(agentId, handler).catch((error) => {
      forgeDebug({
        scope: 'internal-chat',
        level: 'error',
        agentId,
        message: 'Failed to replay unread messages',
        context: { error: error instanceof Error ? error.message : String(error) },
      });
    });
  }

  function clearHandler(agentId: string, handler?: InternalChatHandler) {
    if (!handler) {
      handlers.delete(agentId);
      return;
    }

    if (handlers.get(agentId) !== handler) {
      return;
    }

    handlers.delete(agentId);
  }

  function deliverMessage(agentId: string, message: InternalChatDeliveryMessage): boolean {
    const handler = handlers.get(agentId);
    if (!handler) {
      return false;
    }

    void handler(message);
    return true;
  }

  async function replayUnreadMessages(agentId: string, handler: InternalChatHandler) {
    const unreadRows = await db
      .select({
        conversationId: internalChatMessages.conversationId,
        conversationName: internalChatConversations.name,
        conversationType: internalChatConversations.type,
        messageId: internalChatMessages.id,
        content: internalChatMessages.content,
        createdAt: internalChatMessages.createdAt,
        authorAccountId: internalChatMessages.authorAccountId,
        authorDisplayName: internalChatAccounts.displayName,
        authorSlug: internalChatAccounts.slug,
      })
      .from(internalChatMessageReads)
      .innerJoin(
        internalChatMessages,
        eq(internalChatMessages.id, internalChatMessageReads.messageId),
      )
      .innerJoin(
        internalChatConversations,
        eq(internalChatConversations.id, internalChatMessages.conversationId),
      )
      .innerJoin(
        internalChatAccounts,
        eq(internalChatAccounts.id, internalChatMessages.authorAccountId),
      )
      .where(
        and(eq(internalChatMessageReads.agentId, agentId), isNull(internalChatMessageReads.readAt)),
      )
      .orderBy(internalChatMessages.createdAt)
      .all();

    if (unreadRows.length === 0) {
      return;
    }

    const participantsByConversationId = new Map<string, InternalChatGroupParticipant[]>();

    for (const row of unreadRows) {
      let participants = participantsByConversationId.get(row.conversationId);

      if (!participants) {
        participants = await deps.listGroupMembersOrDmPeers(agentId, row.conversationId);
        participantsByConversationId.set(row.conversationId, participants);
      }

      await handler({
        targetKey: row.conversationId,
        messageId: row.messageId,
        conversationName:
          row.conversationName ??
          (row.conversationType === 'dm' ? row.authorDisplayName : undefined),
        authorId: row.authorAccountId,
        authorDisplayName: row.authorDisplayName,
        authorUsername: row.authorSlug,
        content: row.content,
        attachments: await deps.readMessageAttachments(row.messageId),
        createdAt: new Date(row.createdAt).toISOString(),
        metadata: {
          conversationType: row.conversationType as any,
          groupMembers:
            (row.conversationType as string) === 'group'
              ? participants.map((participant) => ({
                  participantId: participant.accountId,
                  agentId: (participant.agentId ?? null) as string,
                  slug: participant.slug,
                  displayName: participant.displayName,
                }))
              : undefined,
        } as any,
      });
    }
  }

  function deliverToHandler(agentId: string, message: InternalChatDeliveryMessage): boolean {
    return deliverMessage(agentId, message);
  }

  function deliverToParticipants(params: {
    participants: InternalChatGroupParticipant[];
    conversation: { id: string; name: string; type: 'dm' | 'group' };
    messageId: string;
    author: { id: string; displayName: string; slug: string };
    content: string;
    attachments: CommunicationFile[];
    createdAt: string;
    excludeAccountId?: string;
  }): string[] {
    const liveAgentIds: string[] = [];

    for (const participant of params.participants) {
      if (participant.agentId === undefined) {
        continue;
      }
      if (
        params.excludeAccountId !== undefined &&
        participant.accountId === params.excludeAccountId
      ) {
        continue;
      }
      if (
        participant.agentId === null ||
        participant.agentId === undefined ||
        !handlers.has(participant.agentId)
      ) {
        continue;
      }

      void handlers.get(participant.agentId)!({
        targetKey: params.conversation.id,
        messageId: params.messageId,
        conversationName: params.conversation.name,
        authorId: params.author.id,
        authorDisplayName: params.author.displayName,
        authorUsername: params.author.slug,
        content: params.content,
        attachments: params.attachments,
        createdAt: params.createdAt,
        metadata: {
          conversationType: params.conversation.type,
          groupMembers:
            params.conversation.type === 'group'
              ? buildGroupMetadata(params.participants)
              : undefined,
        } as any,
      });

      liveAgentIds.push(participant.agentId as string);
    }

    return liveAgentIds;
  }

  return {
    onReceiveMessage,
    clearHandler,
    deliverMessage,
    deliverToHandler,
    deliverToParticipants,
  };
}

export { createConnectionImpl as createInternalChatConnection };

export type InternalChatConnectionImpl = ReturnType<typeof createConnectionImpl>;

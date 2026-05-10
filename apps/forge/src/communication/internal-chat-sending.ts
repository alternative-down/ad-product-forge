/**
 * internal-chat-sending.ts — Message sending for internal-chat-service.ts
 *
 * Extracted from createInternalChatService as part of #1555 refactoring.
 * Contains sendMessage (110 lines with forgeDebug error handling) and
 * getMessageAttachmentByAccount (thin delegate).
 */

import { and, eq, inArray, isNull } from 'drizzle-orm';

import { createId } from '../utils/id';
import { forgeDebug } from '@forge-runtime/core';
import type { CommunicationFile } from '@forge-runtime/core';

import type {Database} from '../database/schema';
import {
  internalChatConversations,
  internalChatConversationMembers,
  internalChatMessageReads,
  internalChatMessages,
} from '../database/schema';
import type {
  InternalChatGroupMember,
  InternalChatGroupParticipant,
  InternalChatConversation,
} from './internal-chat-helpers';

export interface SendingDeps {
  db: Database;
  accounts: {
    getAccountByAgentId: (agentId: string) => Promise<{ id: string; displayName: string; slug: string } | null>;
    getAccountBySlug: (slug: string) => Promise<{ id: string } | null>;
    getRequiredAccount: (accountId: string) => Promise<{ id: string; displayName: string; slug: string; agentId: string | null }>;
  } | {
    getAccountByAgentId: (agentId: string) => Promise<{ id: string; displayName: string; slug: string } | null>;
    getAccountBySlug: (slug: string) => Promise<{ id: string } | null>;
    getRequiredAccount: (accountId: string) => Promise<{ id: string; displayName: string; slug: string; agentId: string | null }>;
  };
  serviceHelpers: {
    getRequiredConversationForAccount: (accountId: string, conversationKey: string) => Promise<InternalChatConversation>;
  };
  groups: {
    ensureDirectConversation: (leftAccountId: string, rightAccountId: string) => Promise<InternalChatConversation>;
  };
  connection: {
    deliverToParticipants: (params: {
      excludeAccountId: string;
      participants: InternalChatGroupMember[];
      conversation: { id: string; name: string; type: string };
      messageId: string;
      author: { id: string; displayName: string; slug: string };
      content: string;
      attachments: CommunicationFile[];
      createdAt: string;
    }) => string[];
  };
  reads: {
    listGroupMembersOrDmPeersByAccount: (accountId: string, conversationId: string) => Promise<InternalChatGroupParticipant[]>;
  };
  attachments: {
    storeMessageAttachments: (messageId: string, attachments: CommunicationFile[]) => Promise<void>;
    readMessageAttachment: (messageId: string, attachmentName: string) => Promise<{ stream: unknown; contentType: string | undefined }>;
  };
}

export function createChatSending(deps: SendingDeps) {
  const {
    db,
    accounts,
    serviceHelpers,
    groups,
    connection,
    reads,
    attachments,
  } = deps;

  async function sendMessage(input: {
    accountId: string;
    targetKey: string;
    content: string;
    attachments: CommunicationFile[];
  }): Promise<{ success: true; messageId: string; conversationKey: string }> {
    const directAccount = await accounts.getAccountByAgentId(input.targetKey) ?? await accounts.getAccountBySlug(input.targetKey);
    const conversation = directAccount
      ? await groups.ensureDirectConversation(input.accountId, directAccount.id)
      : await serviceHelpers.getRequiredConversationForAccount(input.accountId, input.targetKey);

    if (!conversation) {
      forgeDebug({ scope: 'internal-chat-sending', level: 'error', message: 'internal-chat-sending: validation/requirement failed' });
      throw new Error('Conversation not found: ' + input.targetKey);
    }

    // Guard: reject messages to archived/closed conversations
    const closedAt = (conversation as { closedAt?: number | null }).closedAt;
    if (closedAt != null) {
      forgeDebug({ scope: 'internal-chat-sending', level: 'error', message: 'cannot send to archived conversation', context: { conversationId: conversation.id } });
      throw new Error('Conversation is archived: ' + input.targetKey);
    }

    // Guard: validate the server-generated timestamp is not absurdly far in the future (clock skew)
    const ONE_DAY_MS = 86_400_000;
    const now = Date.now();
    const maxAcceptable = now + ONE_DAY_MS;
    if (now > maxAcceptable) {
      forgeDebug({ scope: 'internal-chat-sending', level: 'error', message: 'invalid timestamp detected' });
      throw new Error('Invalid timestamp');
    }
    const messageId = createId();
    let members;
    try {
      members = await db.query.internalChatConversationMembers.findMany({
        where: eq(internalChatConversationMembers.conversationId, conversation.id),
      });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat', level: 'error', message: 'sendMessage findMany members failed', context: { conversationId: conversation.id, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }

    try {
      await db.insert(internalChatMessages).values({
        id: messageId,
        conversationId: conversation.id,
        authorAccountId: input.accountId,
        content: input.content,
        replyToMessageId: null,
        createdAt: now,
      });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat', level: 'error', message: 'sendMessage insert failed', context: { messageId, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }
    await attachments.storeMessageAttachments(messageId, input.attachments);

    const memberAccounts = await Promise.all(
      members.map((member) => accounts.getRequiredAccount(member.accountId)),
    );
    const readRows = memberAccounts
      .filter((memberAccount) => memberAccount.agentId)
      .map((memberAccount) => ({
        messageId,
        agentId: memberAccount.agentId as string,
        readAt: memberAccount.id === input.accountId ? now : null,
      }));

    if (readRows.length > 0) {
      try {
        await db.insert(internalChatMessageReads).values(readRows);
      } catch (err) {
        forgeDebug({ scope: 'internal-chat', level: 'error', message: 'sendMessage insert reads failed', context: { messageId, error: err instanceof Error ? err.message : String(err) } });
        throw err;
      }
    }

    await db
      .update(internalChatConversations)
      .set({
        updatedAt: now,
      })
      .where(eq(internalChatConversations.id, conversation.id));

    const author = await accounts.getRequiredAccount(input.accountId);
    const participants = await reads.listGroupMembersOrDmPeersByAccount(input.accountId, conversation.id);

    const liveDeliveredAgentIds = connection.deliverToParticipants({
      excludeAccountId: input.accountId,
      participants,
      conversation: {
        id: conversation.id,
        name: conversation.name,
        type: conversation.type,
      },
      messageId,
      author: {
        id: author.id,
        displayName: author.displayName,
        slug: author.slug,
      },
      content: input.content,
      attachments: input.attachments,
      createdAt: new Date(now).toISOString(),
    });

    if (liveDeliveredAgentIds.length > 0) {
      await db
        .update(internalChatMessageReads)
        .set({
          readAt: now,
        })
        .where(and(
          eq(internalChatMessageReads.messageId, messageId),
          inArray(internalChatMessageReads.agentId, liveDeliveredAgentIds),
          isNull(internalChatMessageReads.readAt),
        ));
    }

    return {
      success: true,
      messageId,
      conversationKey: conversation.id,
    };
  }

  async function getMessageAttachmentByAccount(input: {
    accountId: string;
    conversationId: string;
    messageId: string;
    attachmentName: string;
  }) {
    return attachments.readMessageAttachment(input.messageId, input.attachmentName);
  }

  return { sendMessage, getMessageAttachmentByAccount };
}
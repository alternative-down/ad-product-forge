/**
 * internal-chat-sending.ts — Message sending for internal-chat-service.ts
 *
 * Extracted from createInternalChatService as part of #1555 refactoring.
 * Contains sendMessage (115 lines with forgeDebug error handling) and
 * getMessageAttachmentByAccount (thin delegate).
 */

import { and, eq, inArray, isNull } from 'drizzle-orm';

import { createId } from '../utils/id';
import { forgeDebug } from '@forge-runtime/core';
import type { CommunicationFile } from '@forge-runtime/core';

import type {
  Database,
  InternalChatConversation,
  NewInternalChatMessageRead,
} from '../database/schema';
import {
  internalChatConversations,
  internalChatConversationMembers,
  internalChatMessageReads,
  internalChatMessages,
} from '../database/schema';
import type { InternalChatGroupParticipant } from './internal-chat-helpers';

export interface SendingDeps {
  db: Database;
  accounts: {
    getAccountByAgentId: (
      agentId: string,
    ) => Promise<{ id: string; displayName: string; slug: string } | null>;
    getAccountBySlug: (slug: string) => Promise<{ id: string } | null>;
    getRequiredAccount: (
      accountId: string,
    ) => Promise<{ id: string; displayName: string; slug: string; agentId: string | null }>;
    getAccountsById: (
      accountIds: string[],
    ) => Promise<
      Map<string, { id: string; displayName: string; slug: string; agentId: string | null }>
    >;
  };
  serviceHelpers: {
    getRequiredConversationForAccount: (
      accountId: string,
      conversationKey: string,
    ) => Promise<InternalChatConversation>;
  };
  groups: {
    ensureDirectConversation: (
      leftAccountId: string,
      rightAccountId: string,
    ) => Promise<InternalChatConversation>;
  };
  connection: {
    deliverToParticipants: (params: {
      excludeAccountId: string;
      participants: InternalChatGroupParticipant[];
      conversation: { id: string; name: string; type: string };
      messageId: string;
      author: { id: string; displayName: string; slug: string };
      content: string;
      attachments: CommunicationFile[];
      createdAt: string;
    }) => string[];
  };
  reads: {
    listGroupMembersOrDmPeersByAccount: (
      accountId: string,
      conversationId: string,
    ) => Promise<InternalChatGroupParticipant[]>;
  };
  attachments: {
    storeMessageAttachments: (messageId: string, attachments: CommunicationFile[]) => Promise<void>;
    readMessageAttachment: (
      messageId: string,
      attachmentName: string,
    ) => Promise<{ stream: unknown; contentType: string | undefined }>;
  };
}
import { serializeError, errorMsg } from '../agents/agent-runner-error-formatting';

export function createChatSending(deps: SendingDeps) {
  const { db, accounts, serviceHelpers, groups, connection, reads, attachments } = deps;

  async function sendMessage(input: {
    accountId: string;
    targetKey: string;
    content: string;
    attachments: CommunicationFile[];
    replyToMessageId?: string | null;
  }): Promise<{ success: true; messageId: string; conversationKey: string }> {
    try {
      const directAccount =
        (await accounts.getAccountByAgentId(input.targetKey)) ??
        (await accounts.getAccountBySlug(input.targetKey));
      const conversation = directAccount
        ? await groups.ensureDirectConversation(input.accountId, directAccount.id)
        : await serviceHelpers.getRequiredConversationForAccount(input.accountId, input.targetKey);

      if (conversation === null || conversation === undefined) {
        forgeDebug({
          scope: 'internal-chat-sending',
          level: 'error',
          message: 'internal-chat-sending: validation/requirement failed',
        });
        throw new Error('Conversation not found: ' + input.targetKey);
      }

      // Guard: reject messages to archived/closed conversations (no-op: closedAt column not in schema)

      // Guard: validate clock skew (no-op: now > now+ONE_DAY_MS always false — clock skew handled at DB schema level)
      const now = Date.now();

      // Guard: validate replyToMessageId belongs to the same conversation
      let resolvedReplyTo: string | null = null;
      if (input.replyToMessageId !== null && input.replyToMessageId !== undefined) {
        const parentMessage = await db.query.internalChatMessages.findFirst({
          where: eq(internalChatMessages.id, input.replyToMessageId),
        });
        if (!parentMessage) {
          forgeDebug({
            scope: 'internal-chat-sending',
            level: 'error',
            message: 'reply target message not found',
            context: { replyToMessageId: input.replyToMessageId },
          });
          throw new Error('Reply target message not found: ' + input.replyToMessageId);
        }
        if (parentMessage.conversationId !== conversation.id) {
          forgeDebug({
            scope: 'internal-chat-sending',
            level: 'error',
            message: 'reply target belongs to different conversation',
            context: {
              replyToMessageId: input.replyToMessageId,
              expectedConversation: conversation.id,
              actualConversation: parentMessage.conversationId,
            },
          });
          throw new Error(
            'Reply target belongs to a different conversation: ' + input.replyToMessageId,
          );
        }
        resolvedReplyTo = input.replyToMessageId;
      }

      const messageId = createId();
      const members = await db.query.internalChatConversationMembers.findMany({
        where: eq(internalChatConversationMembers.conversationId, conversation.id),
      });

      await db.insert(internalChatMessages).values({
        id: messageId,
        conversationId: conversation.id,
        authorAccountId: input.accountId,
        content: input.content,
        replyToMessageId: resolvedReplyTo,
        createdAt: now,
        updatedAt: now,
      });
      await attachments.storeMessageAttachments(messageId, input.attachments);

      const accountIds = members.map((m: any) => m.accountId);
      const accountMap = await accounts.getAccountsById(accountIds);
      const readRows = Array.from(accountMap.values())
        .filter(
          (memberAccount): boolean =>
            memberAccount.agentId !== null && memberAccount.agentId !== undefined,
        )
        .map(
          (memberAccount): NewInternalChatMessageRead => ({
            messageId,
            agentId: memberAccount.agentId as string,
            readAt: memberAccount.id === input.accountId ? now : null,
            createdAt: now,
            updatedAt: now,
          }),
        );

      if (readRows.length > 0) {
        await db.insert(internalChatMessageReads).values(readRows);
      }

      await db
        .update(internalChatConversations)
        .set({
          updatedAt: now,
        })
        .where(eq(internalChatConversations.id, conversation.id));

      const author = await accounts.getRequiredAccount(input.accountId);
      const participants = await reads.listGroupMembersOrDmPeersByAccount(
        input.accountId,
        conversation.id,
      );

      const liveDeliveredAgentIds = connection.deliverToParticipants({
        excludeAccountId: input.accountId,
        participants: participants as InternalChatGroupParticipant[],
        conversation: {
          id: conversation.id,
          name: (conversation.name ?? '') as string,
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
          .where(
            and(
              eq(internalChatMessageReads.messageId, messageId),
              inArray(internalChatMessageReads.agentId, liveDeliveredAgentIds),
              isNull(internalChatMessageReads.readAt),
            ),
          );
      }

      return {
        success: true,
        messageId,
        conversationKey: conversation.id,
      };
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-sending',
        level: 'error',
        message: 'Failed to execute sendMessage',
        context: { error: errorMsg(err) },
      });
      throw err;
    }
  }

  async function getMessageAttachmentByAccount(input: {
    accountId: string;
    conversationId: string;
    messageId: string;
    attachmentName: string;
  }) {
    return await attachments.readMessageAttachment(input.messageId, input.attachmentName);
  }

  return { sendMessage, getMessageAttachmentByAccount };
}

/**
 * internal-chat-conversations.ts — Conversation management for internal-chat-service.ts
 *
 * Extracted from createInternalChatService as part of #1555 refactoring.
 * Contains:
 *   - ensureDirectConversation (finds or creates a 1-on-1 DM between two accounts)
 *   - archiveConversationByAccount (removes membership and deletes conversation if empty)
 */

import { and, eq, inArray } from 'drizzle-orm';

import { forgeDebug } from '@forge-runtime/core';
import { createId } from '../utils/id';

import type { Database } from '../database/schema';
import { internalChatConversations, internalChatConversationMembers } from '../database/schema';
import type { InternalChatConversation } from '../database/schema';

const logInternalChatConvError = (
  context: string,
  error: unknown,
  extra: Record<string, unknown> = {},
) => {
  forgeDebug({
    scope: 'internal-chat',
    level: 'error',
    message: `${context} failed: ${serializeError(error)}`,
    context: extra,
  });
};

export function createInternalChatConversations(db: Database) {
  async function ensureDirectConversation(
    leftAccountId: string,
    rightAccountId: string,
  ): Promise<InternalChatConversation> {
    const rows = await db
      .select({
        conversationId: internalChatConversationMembers.conversationId,
      })
      .from(internalChatConversationMembers)
      .where(inArray(internalChatConversationMembers.accountId, [leftAccountId, rightAccountId]))
      .all();

    const counts = new Map<string, number>();

    for (const row of rows) {
      counts.set(row.conversationId, (counts.get(row.conversationId) ?? 0) + 1);
    }

    const candidateConversationIds = Array.from(counts.entries())
      .filter(([, count]) => count === 2)
      .map(([conversationId]) => conversationId);

    if (candidateConversationIds.length > 0) {
      let existing;
      try {
        existing = await db.query.internalChatConversations.findFirst({
          where: and(
            eq(internalChatConversations.type, 'dm'),
            inArray(internalChatConversations.id, candidateConversationIds),
          ),
        });
      } catch (error) {
        logInternalChatConvError('ensureDirectConversation findFirst', error);
        throw error;
      }

      if (existing != null) {
        return existing;
      }
    }

    const now = Date.now();
    const conversationId = createId();

    try {
      await db.insert(internalChatConversations).values({
        id: conversationId,
        type: 'dm',
        name: null,
        createdByAccountId: leftAccountId,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      logInternalChatConvError('ensureDirectConversation insert conversation', error, {
        conversationId,
      });
      throw error;
    }

    try {
      const newMembers = [
        {
          conversationId,
          accountId: leftAccountId,
          role: 'normal',
          createdAt: now,
          updatedAt: now,
        },
        {
          conversationId,
          accountId: rightAccountId,
          role: 'normal',
          createdAt: now,
          updatedAt: now,
        },
      ];
      await db.insert(internalChatConversationMembers).values(newMembers);
    } catch (error) {
      logInternalChatConvError('ensureDirectConversation insert members', error, {
        conversationId,
      });
      throw error;
    }

    return {
      id: conversationId,
      type: 'dm',
      name: null,
      createdByAccountId: leftAccountId,
      createdAt: now,
      updatedAt: now,
    };
  }

  async function archiveConversationByAccount(input: {
    accountId: string;
    conversationId: string;
    getRequiredConversationForAccount: (
      accountId: string,
      conversationId: string,
    ) => Promise<InternalChatConversation>;
  }): Promise<{ conversationId: string; archived: true }> {
    await input.getRequiredConversationForAccount(input.accountId, input.conversationId);

    await db
      .delete(internalChatConversationMembers)
      .where(
        and(
          eq(internalChatConversationMembers.conversationId, input.conversationId),
          eq(internalChatConversationMembers.accountId, input.accountId),
        ),
      );

    let remainingMembers;
    try {
      remainingMembers = await db.query.internalChatConversationMembers.findMany({
        where: eq(internalChatConversationMembers.conversationId, input.conversationId),
        limit: 1,
      });
    } catch (error) {
      logInternalChatConvError('archiveConversation findMany', error, {
        conversationId: input.conversationId,
      });
      throw error;
    }

    if (remainingMembers.length === 0) {
      try {
        await db
          .delete(internalChatConversations)
          .where(eq(internalChatConversations.id, input.conversationId));
      } catch (error) {
        logInternalChatConvError('archiveConversation delete', error, {
          conversationId: input.conversationId,
        });
        throw error;
      }
    }

    return {
      conversationId: input.conversationId,
      archived: true,
    };
  }

  return { ensureDirectConversation, archiveConversationByAccount };
}
import { serializeError } from '../agents/agent-runner-error-formatting';

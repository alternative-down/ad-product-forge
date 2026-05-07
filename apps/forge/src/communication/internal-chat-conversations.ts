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
import type { Database } from '../database/index';
import {
  internalChatConversations,
  internalChatConversationMembers,
} from '../database/schema';
import type { InternalChatConversation } from './internal-chat-helpers';

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
      .where(inArray(internalChatConversationMembers.accountId, [leftAccountId, rightAccountId]));

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
      } catch (err) {
        forgeDebug({ scope: 'internal-chat', level: 'error', message: 'ensureDirectConversation findFirst failed', context: { error: err instanceof Error ? err.message : String(err) } });
        throw err;
      }

      if (existing) {
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
    } catch (err) {
      forgeDebug({ scope: 'internal-chat', level: 'error', message: 'ensureDirectConversation insert conversation failed', context: { conversationId, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }

    try {
      await db.insert(internalChatConversationMembers).values([
        {
          conversationId,
          accountId: leftAccountId,
          role: 'normal',
          createdAt: now,
        },
        {
          conversationId,
          accountId: rightAccountId,
          role: 'normal',
          createdAt: now,
        },
      ]);
    } catch (err) {
      forgeDebug({ scope: 'internal-chat', level: 'error', message: 'ensureDirectConversation insert members failed', context: { conversationId, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }

    return db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, conversationId),
    }) as Promise<InternalChatConversation>;
  }

  async function archiveConversationByAccount(input: {
    accountId: string;
    conversationId: string;
    getRequiredConversationForAccount: (accountId: string, conversationId: string) => Promise<InternalChatConversation>;
  }): Promise<{ conversationId: string; archived: true }> {
    await input.getRequiredConversationForAccount(input.accountId, input.conversationId);

    await db
      .delete(internalChatConversationMembers)
      .where(and(
        eq(internalChatConversationMembers.conversationId, input.conversationId),
        eq(internalChatConversationMembers.accountId, input.accountId),
      ));

    let remainingMembers;
    try {
      remainingMembers = await db.query.internalChatConversationMembers.findMany({
        where: eq(internalChatConversationMembers.conversationId, input.conversationId),
        limit: 1,
      });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat', level: 'error', message: 'archiveConversation findMany failed', context: { conversationId: input.conversationId, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }

    if (remainingMembers.length === 0) {
      try {
        await db
          .delete(internalChatConversations)
          .where(eq(internalChatConversations.id, input.conversationId));
      } catch (err) {
        forgeDebug({ scope: 'internal-chat', level: 'error', message: 'archiveConversation delete failed', context: { conversationId: input.conversationId, error: err instanceof Error ? err.message : String(err) } });
        throw err;
      }
    }

    return {
      conversationId: input.conversationId,
      archived: true,
    };
  }

  return { ensureDirectConversation, archiveConversationByAccount };
}
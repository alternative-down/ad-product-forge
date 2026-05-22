/**
 * Internal Chat — Accounts Module
 *
 * Account registration, lookup, and conversation setup helpers.
 * Extracted from #1283 / #1215 refactor of internal-chat-service.ts.
 * All function bodies are identical to the original service.
 * The service re-imports and re-exports to preserve its exact API surface.
 *
 * @module
 */
import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';

import type { Database } from '../database/schema';
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
} from '../database/schema';
import type { InternalChatConversation, NewInternalChatConversation, NewInternalChatConversationMember } from '../database/schema';
import { createId } from '../utils/id';
import {
  buildAgentAccountDescription,
  createInternalChatSlug,
  sortParticipantsBySelfFirst,
  type InternalChatGroupParticipant,
} from './internal-chat-helpers';
import { InternalChatAccountNotFoundError, InternalChatError } from './internal-chat-errors';

export function createInternalChatAccounts(db: Database) {
  // ── Account registration ──────────────────────────────────────────────

  async function registerAgentAccount(input: {
    agentId: string;
    displayName: string;
    agentName: string;
    agentDescription?: string;
    roleName?: string;
    roleDescription?: string;
  }) {
    try {
      const now = Date.now();
      const description = buildAgentAccountDescription({
        agentId: input.agentId,
        agentName: input.agentName,
        agentDescription: input.agentDescription,
        roleName: input.roleName,
        roleDescription: input.roleDescription,
      });
      const existing = await db.query.internalChatAccounts.findFirst({
        where: eq(internalChatAccounts.agentId, input.agentId),
      });

      if (existing != null) {
        await db
          .update(internalChatAccounts)
          .set({
            displayName: input.displayName,
            description,
            updatedAt: now,
          })
          .where(eq(internalChatAccounts.agentId, input.agentId));

        return {
          accountId: existing.id,
          agentId: input.agentId,
          slug: existing.slug,
          displayName: input.displayName,
          description,
        };
      }

      const slug = createInternalChatSlug(input.displayName);
      const accountId = `acct_${createId()}`;

      await db.insert(internalChatAccounts).values({
        id: accountId,
        agentId: input.agentId,
        slug,
        displayName: input.displayName,
        description,
        createdAt: now,
        updatedAt: now,
      });

      // Create DM conversations with all existing agent accounts
      const existingAgentAccounts = await db.query.internalChatAccounts.findMany({
        where: and(
          isNotNull(internalChatAccounts.agentId),
          ne(internalChatAccounts.agentId, input.agentId),
        ),
      });

      for (const existing of existingAgentAccounts) {
        await ensureDirectConversation(accountId, existing.id);
      }

      return {
        accountId,
        agentId: input.agentId,
        slug,
        displayName: input.displayName,
        description,
      };
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-accounts',
        level: 'error',
        message: 'Failed to execute registerAgentAccount',
        context: { error: String(serializeError(err)) },
      });
      throw err;
    }
  }

  async function registerExternalAccount(input: {
    slug: string;
    displayName: string;
    description?: string;
  }) {
    try {
      const now = Date.now();
      const accountId = `acct_${createId()}`;
      await db.insert(internalChatAccounts).values({
        id: accountId,
        slug: input.slug,
        displayName: input.displayName,
        description: input.description ?? null,
        createdAt: now,
        updatedAt: now,
      });
      return { accountId, slug: input.slug };
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-accounts',
        level: 'error',
        message: 'Failed to execute registerExternalAccount',
        context: { error: String(serializeError(err)) },
      });
      throw err;
    }
  }

  async function updateExternalAccount(input: {
    accountId: string;
    displayName?: string;
    description?: string;
  }) {
    try {
      const now = Date.now();
      await db
        .update(internalChatAccounts)
        .set({
          displayName: input.displayName,
          description: input.description,
          updatedAt: now,
        })
        .where(eq(internalChatAccounts.id, input.accountId));
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-accounts',
        level: 'error',
        message: 'Failed to execute updateExternalAccount',
        context: { error: String(serializeError(err)) },
      });
      throw err;
    }
  }

  async function deleteExternalAccount(input: { accountId: string }) {
    try {
      await db.delete(internalChatAccounts).where(eq(internalChatAccounts.id, input.accountId));
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-accounts',
        level: 'error',
        message: 'Failed to execute deleteExternalAccount',
        context: { error: String(serializeError(err)) },
      });
      throw err;
    }
  }
  const deleteAgentAccount = deleteExternalAccount;

  // ── Account lookup ─────────────────────────────────────────────────────

  async function listAccounts(input: { excludeAgentId?: string } = {}) {
    try {
      if (input.excludeAgentId !== null && input.excludeAgentId !== undefined) {
        return await db.query.internalChatAccounts.findMany({
          where: ne(internalChatAccounts.agentId, input.excludeAgentId),
        });
      }
      return await db.query.internalChatAccounts.findMany({});
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-accounts',
        level: 'error',
        message: 'Failed to execute listAccounts',
        context: { error: String(serializeError(err)) },
      });
      throw err;
    }
  }

  async function getAccountBySlug(slug: string) {
    try {
      return await db.query.internalChatAccounts.findFirst({
        where: eq(internalChatAccounts.slug, slug),
      });
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-accounts',
        level: 'error',
        message: 'Failed to execute getAccountBySlug',
        context: { error: String(serializeError(err)) },
      });
      throw err;
    }
  }

  async function getAccountByAgentId(agentId: string) {
    try {
      return await db.query.internalChatAccounts.findFirst({
        where: eq(internalChatAccounts.agentId, agentId),
      });
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-accounts',
        level: 'error',
        message: 'Failed to execute getAccountByAgentId',
        context: { error: String(serializeError(err)) },
      });
      throw err;
    }
  }

  async function getAccountByTargetKey(targetKey: string) {
    try {
      // targetKey is used as a slug or id lookup
      const account =
        (await db.query.internalChatAccounts.findFirst({
          where: eq(internalChatAccounts.slug, targetKey),
        })) ??
        (await db.query.internalChatAccounts.findFirst({
          where: eq(internalChatAccounts.id, targetKey),
        }));
      return account ?? null;
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-accounts',
        level: 'error',
        message: 'Failed to execute getAccountByTargetKey',
        context: { error: String(serializeError(err)) },
      });
      throw err;
    }
  }

  async function getRequiredAccount(accountId: string) {
    try {
      const account = await db.query.internalChatAccounts.findFirst({
        where: eq(internalChatAccounts.id, accountId),
      });
      if (account == null) {
        forgeDebug({
          scope: 'internal-chat-accounts',
          level: 'warn',
          message: 'deleteInternalChatAccount: not found',
          context: { accountId },
        });
        throw new InternalChatAccountNotFoundError(accountId);
      }
      return account;
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-accounts',
        level: 'error',
        message: 'Failed to execute getRequiredAccount',
        context: { error: String(serializeError(err)) },
      });
      throw err;
    }
  }

  async function getAccountsById(accountIds: string[]) {
    try {
      if (accountIds.length === 0) {
        return new Map();
      }
      const accounts = await db.query.internalChatAccounts.findMany({
        where:
          accountIds.length === 1
            ? eq(internalChatAccounts.id, accountIds[0])
            : inArray(internalChatAccounts.id, accountIds),
      });
      return new Map(accounts.map((a) => [a.id, a]));
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-accounts',
        level: 'error',
        message: 'Failed to execute getAccountsById',
        context: { error: String(serializeError(err)) },
      });
      throw err;
    }
  }

  async function getRequiredAgentAccount(agentId: string) {
    try {
      const account = await db.query.internalChatAccounts.findFirst({
        where: eq(internalChatAccounts.agentId, agentId),
      });
      if (account == null) {
        forgeDebug({
          scope: 'internal-chat-accounts',
          level: 'warn',
          message: 'getAgentInternalChatAccount: not found',
          context: { agentId },
        });
        throw new InternalChatAccountNotFoundError(
          agentId,
          `Internal chat account not found for agent: ${agentId}`,
        );
      }
      return account;
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-accounts',
        level: 'error',
        message: 'Failed to execute getRequiredAgentAccount',
        context: { error: String(serializeError(err)) },
      });
      throw err;
    }
  }

  async function getRequiredAccountBySlug(slug: string) {
    try {
      const account = await db.query.internalChatAccounts.findFirst({
        where: eq(internalChatAccounts.slug, slug),
      });
      if (account == null) {
        throw new InternalChatAccountNotFoundError(slug);
      }
      return account;
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-accounts',
        level: 'error',
        message: 'Failed to execute getRequiredAccountBySlug',
        context: { error: String(serializeError(err)) },
      });
      throw err;
    }
  }

  async function getConversationForAgent(agentId: string, conversationId: string) {
    try {
      const account = await db.query.internalChatAccounts.findFirst({
        where: eq(internalChatAccounts.agentId, agentId),
      });
      if (account == null) {
        throw new InternalChatError('account-not-found', `No account found for agent: ${agentId}`);
      }
      const conversation = (await db.query.internalChatConversations.findFirst({
        where: and(
          eq(internalChatConversations.id, conversationId),
          eq(internalChatConversationMembers.accountId, account.id),
        ),
      })) as InternalChatConversation;
      if (conversation === null || conversation === undefined) {
        throw new InternalChatError(
          'conversation-not-found',
          `Conversation ${conversationId} not found`,
        );
      }
      return conversation;
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-accounts',
        level: 'error',
        message: 'Failed to execute getConversationForAgent',
        context: { error: String(serializeError(err)) },
      });
      throw err;
    }
  }

  // ── Conversation helpers ────────────────────────────────────────────────

  async function ensureDirectConversation(leftAccountId: string, rightAccountId: string) {
    try {
      const rows = await db
        .select({ conversationId: internalChatConversationMembers.conversationId })
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
        const existing = (await db.query.internalChatConversations.findFirst({
          where: and(
            eq(internalChatConversations.type, 'dm'),
            inArray(internalChatConversations.id, candidateConversationIds),
          ),
        })) as InternalChatConversation;
        if (existing !== null && existing !== undefined) return existing;
      }

      const now = Date.now();
      const conversationId = createId();
      await db.insert(internalChatConversations).values({
        id: conversationId,
        type: 'dm',
        name: null,
        createdByAccountId: leftAccountId,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(internalChatConversationMembers).values([
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
      ] as NewInternalChatConversationMember[]);

      const conversation = (await db.query.internalChatConversations.findFirst({
        where: eq(internalChatConversations.id, conversationId),
      })) as InternalChatConversation;
      return conversation!;
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-accounts',
        level: 'error',
        message: 'Failed to execute ensureDirectConversation',
        context: { error: String(serializeError(err)) },
      });
      throw err;
    }
  }

  async function listGroupMembersOrDmPeersByAccount(accountId: string, conversationId: string) {
    try {
      const rows = await db
        .select({
          accountId: internalChatConversationMembers.accountId,
          agentId: internalChatAccounts.agentId,
          slug: internalChatAccounts.slug,
          displayName: internalChatAccounts.displayName,
        })
        .from(internalChatConversationMembers)
        .innerJoin(
          internalChatAccounts,
          eq(internalChatAccounts.id, internalChatConversationMembers.accountId),
        )
        .where(eq(internalChatConversationMembers.conversationId, conversationId));

      return sortParticipantsBySelfFirst(rows as InternalChatGroupParticipant[], accountId);
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-accounts',
        level: 'error',
        message: 'Failed to execute listGroupMembersOrDmPeersByAccount',
        context: { error: String(serializeError(err)) },
      });
      throw err;
    }
  }

  return {
    registerAgentAccount,
    registerExternalAccount,
    updateExternalAccount,
    deleteAgentAccount,
    deleteExternalAccount,
    listAccounts,
    getAccountBySlug,
    getAccountByAgentId,
    getAccountByTargetKey,
    getRequiredAccount,
    getAccountsById,
    getRequiredAgentAccount,
    getRequiredAccountBySlug,
    getConversationForAgent,
    ensureDirectConversation,
    listGroupMembersOrDmPeersByAccount,
  };
}
import { serializeError } from '../agents/agent-runner-error-formatting';

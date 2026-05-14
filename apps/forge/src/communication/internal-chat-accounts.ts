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
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { forgeDebug } from "@forge-runtime/core";


import type {Database} from "../database/schema";
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
} from "../database/schema";
import { createId } from "../utils/id";
import {
  buildAgentAccountDescription,
  createInternalChatSlug,
  sortParticipantsBySelfFirst,
} from "./internal-chat-helpers";
import {
  ChatGroupNotFoundError,
  ConversationNotFoundError,
  ExternalAccountNotFoundError,
  InternalChatAccountNotFoundError,
  InternalChatError,
} from "./internal-chat-errors";


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
    const now = Date.now();
    const description = buildAgentAccountDescription({
      agentId: input.agentId,
      agentName: input.agentName,
      agentDescription: input.agentDescription,
      roleName: input.roleName,
      roleDescription: input.roleDescription,
    });
    let existing;
    try {
      existing = await db.query.internalChatAccounts.findFirst({
        where: eq(internalChatAccounts.agentId, input.agentId),
      });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-accounts', level: 'error', message: 'registerAgentAccount: findFirst failed', context: { agentId: input.agentId, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }

    if (existing) {
      try {
        await db
          .update(internalChatAccounts)
          .set({
            displayName: input.displayName,
            description,
            updatedAt: now,
          })
          .where(eq(internalChatAccounts.agentId, input.agentId));
      } catch (err) {
        forgeDebug({ scope: 'internal-chat-accounts', level: 'error', message: 'registerAgentAccount: update failed', context: { accountId: existing.id, error: err instanceof Error ? err.message : String(err) } });
        throw err;
      }

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

    try {
      await db.insert(internalChatAccounts).values({
        id: accountId,
        agentId: input.agentId,
        slug,
        displayName: input.displayName,
        description,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-accounts', level: 'error', message: 'registerAgentAccount: insert failed', context: { accountId, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }

    // Create DM conversations with all existing agent accounts
    let existingAgentAccounts;
    try {
      existingAgentAccounts = await db.query.internalChatAccounts.findMany({
        where: and(
          isNotNull(internalChatAccounts.agentId),
          ne(internalChatAccounts.agentId, input.agentId),
        ),
      });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-accounts', level: 'error', message: 'registerAgentAccount: list existing accounts failed', context: { error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }

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
  }

  async function registerExternalAccount(input: {
    slug: string;
    displayName: string;
    description?: string;
  }) {
    const now = Date.now();
    const accountId = `acct_${createId()}`;
    try {
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
        message: `registerExternalAccount failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { slug: input.slug, displayName: input.displayName },
      });
      throw err;
    }
  }

  async function updateExternalAccount(input: {
    accountId: string;
    displayName?: string;
    description?: string;
  }) {
    const now = Date.now();
    try {
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
        message: `updateExternalAccount failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { accountId: input.accountId },
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
        message: `deleteExternalAccount failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { accountId: input.accountId },
      });
      throw err;
    }
  }
  const deleteAgentAccount = deleteExternalAccount;

  // ── Account lookup ─────────────────────────────────────────────────────

  async function listAccounts(input: { excludeAgentId?: string } = {}) {
    try {
      if (input.excludeAgentId) {
        return await db.query.internalChatAccounts.findMany({
          where: ne(internalChatAccounts.agentId, input.excludeAgentId),
        });
      }
      return await db.query.internalChatAccounts.findMany({});
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-accounts',
        level: 'error',
        message: `listAccounts failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { excludeAgentId: input.excludeAgentId },
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
      forgeDebug({ scope: 'internal-chat-accounts', level: 'error', message: 'getAccountBySlug failed', context: { slug, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }
  }

  async function getAccountByAgentId(agentId: string) {
    try {
      return await db.query.internalChatAccounts.findFirst({
        where: eq(internalChatAccounts.agentId, agentId),
      });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-accounts', level: 'error', message: 'getAccountByAgentId failed', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }
  }

  async function getAccountByTargetKey(targetKey: string) {
    // targetKey is used as a slug or id lookup
    let account;
    try {
      account =
        (await db.query.internalChatAccounts.findFirst({
          where: eq(internalChatAccounts.slug, targetKey),
        })) ??
        (await db.query.internalChatAccounts.findFirst({
          where: eq(internalChatAccounts.id, targetKey),
        }));
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-accounts', level: 'error', message: '[internal-chat-accounts] getAccountByTargetKey failed', context: { error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }
    return account ?? null;
  }

  async function getRequiredAccount(accountId: string) {
    let account;
    try {
      account = await db.query.internalChatAccounts.findFirst({
        where: eq(internalChatAccounts.id, accountId),
      });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-accounts', level: 'error', message: 'getRequiredAccount DB read failed', context: { accountId, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }
    if (!account) {
      forgeDebug({ scope: 'internal-chat-accounts', level: 'warn', message: 'deleteInternalChatAccount: not found', context: { accountId } });
      throw new InternalChatAccountNotFoundError(accountId);
    }
    return account;
  }

  async function getAccountsById(accountIds: string[]) {
    if (accountIds.length === 0) {
      return new Map();
    }
    let accounts;
    try {
      accounts = await db.query.internalChatAccounts.findMany({
        where: accountIds.length === 1
          ? eq(internalChatAccounts.id, accountIds[0])
          : inArray(internalChatAccounts.id, accountIds),
      });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-accounts', level: 'error', message: 'getAccountsById failed', context: { count: accountIds.length, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }
    return new Map(accounts.map((a) => [a.id, a]));
  }

  async function getRequiredAgentAccount(agentId: string) {
    let account;
    try {
      account = await db.query.internalChatAccounts.findFirst({
        where: eq(internalChatAccounts.agentId, agentId),
      });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-accounts', level: 'error', message: 'getRequiredAgentAccount DB read failed', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }
    if (!account) {
      forgeDebug({ scope: 'internal-chat-accounts', level: 'warn', message: 'getAgentInternalChatAccount: not found', context: { agentId } });
      throw new InternalChatAccountNotFoundError(agentId, `Internal chat account not found for agent: ${agentId}`);
    }
    return account;
  }

  async function getRequiredAccountBySlug(slug: string) {
    let account;
    try {
      account = await db.query.internalChatAccounts.findFirst({
        where: eq(internalChatAccounts.slug, slug),
      });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-accounts', level: 'error', message: 'getRequiredAccountBySlug DB read failed', context: { slug, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }
    if (!account) {
      throw new InternalChatAccountNotFoundError(slug);
    }
    return account;
  }

  async function getConversationForAgent(agentId: string, conversationId: string) {
    let account;
    try {
      account = await db.query.internalChatAccounts.findFirst({
        where: eq(internalChatAccounts.agentId, agentId),
      });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-accounts', level: 'error', message: 'getConversationForAgent DB read failed', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }
    if (!account) {
      throw new InternalChatError('account-not-found', `No account found for agent: ${agentId}`);
    }
    const conversation = await db.query.internalChatConversations.findFirst({
      where: and(
        eq(internalChatConversations.id, conversationId),
        eq(internalChatConversationMembers.accountId, account.id),
      ),
    });
    if (!conversation) {
      throw new InternalChatError('conversation-not-found', `Conversation ${conversationId} not found`);
    }
    return conversation;
  }

  // ── Conversation helpers ────────────────────────────────────────────────

  async function ensureDirectConversation(leftAccountId: string, rightAccountId: string) {
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
      const existing = await db.query.internalChatConversations.findFirst({
        where: and(
          eq(internalChatConversations.type, 'dm'),
          inArray(internalChatConversations.id, candidateConversationIds),
        ),
      });
      if (existing) return existing;
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
      { conversationId, accountId: leftAccountId, role: 'normal', createdAt: now },
      { conversationId, accountId: rightAccountId, role: 'normal', createdAt: now },
    ]);

    const conversation = await db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, conversationId),
    });
    return conversation!;
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

      return sortParticipantsBySelfFirst(rows, accountId);
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-accounts',
        level: 'error',
        message: `listGroupMembersOrDmPeersByAccount failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { accountId, conversationId },
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
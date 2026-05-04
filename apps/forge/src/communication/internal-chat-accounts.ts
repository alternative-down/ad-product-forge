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
import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";

import type { Database } from "../database/index";
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
  InternalChatAccountNotFoundError,
} from "./internal-chat-errors";

export { InternalChatAccountNotFoundError, ConversationNotFoundError, ChatGroupNotFoundError };

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
    const existing = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.agentId, input.agentId),
    });

    if (existing) {
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
  }

  async function registerExternalAccount(input: {
    slug: string;
    displayName: string;
    description?: string;
  }) {
    const now = Date.now();
    const existing = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.slug, input.slug),
    });

    if (existing) {
      await db
        .update(internalChatAccounts)
        .set({
          displayName: input.displayName,
          description: input.description ?? null,
          updatedAt: now,
        })
        .where(eq(internalChatAccounts.id, existing.id));

      return {
        accountId: existing.id,
        slug: existing.slug,
        displayName: input.displayName,
        description: input.description,
      };
    }

    const accountId = `acct_${createId()}`;

    await db.insert(internalChatAccounts).values({
      id: accountId,
      agentId: null,
      slug: input.slug,
      displayName: input.displayName,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return {
      accountId,
      slug: input.slug,
      displayName: input.displayName,
      description: input.description,
    };
  }

  async function updateExternalAccount(input: {
    accountId: string;
    displayName?: string;
    description?: string;
  }) {
    const now = Date.now();
    const existing = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.id, input.accountId),
    });

    if (!existing) {
      throw new InternalChatAccountNotFoundError(input.accountId);
    }

    if (existing.agentId) {
      throw new ExternalAccountNotFoundError(input.accountId);
    }

    await db
      .update(internalChatAccounts)
      .set({
        displayName: input.displayName ?? existing.displayName,
        description: input.description !== undefined ? input.description : existing.description,
        updatedAt: now,
      })
      .where(eq(internalChatAccounts.id, input.accountId));

    return { accountId: input.accountId };
  }

  async function deleteExternalAccount(input: { accountId: string }) {
    await db.delete(internalChatAccounts).where(eq(internalChatAccounts.id, input.accountId));
  }

  async function listAccounts(input: { excludeAgentId?: string } = {}) {
    const rows = await db.query.internalChatAccounts.findMany({
      where: input.excludeAgentId
        ? and(ne(internalChatAccounts.agentId, input.excludeAgentId))
        : undefined,
      orderBy: (t, { asc }) => [asc(t.displayName)],
    });

    return rows.map((row) => ({
      accountId: row.id,
      agentId: row.agentId,
      slug: row.slug,
      displayName: row.displayName,
      description: row.description,
    }));
  }

  async function getAccountBySlug(slug: string) {
    const account = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.slug, slug),
    });

    if (!account) return null;

    return {
      accountId: account.id,
      agentId: account.agentId,
      slug: account.slug,
      displayName: account.displayName,
      description: account.description,
    };
  }

  async function getAccountByAgentId(agentId: string) {
    const account = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.agentId, agentId),
    });

    if (!account) return null;

    return {
      accountId: account.id,
      agentId: account.agentId,
      slug: account.slug,
      displayName: account.displayName,
      description: account.description,
    };
  }

  async function getAccountByTargetKey(_targetKey: string) {
    return null;
  }

  // ── Internal helpers ──────────────────────────────────────────────────

  async function getRequiredAccount(accountId: string) {
    const account = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.id, accountId),
    });

    if (!account) {
      throw new InternalChatAccountNotFoundError(accountId, `Internal chat account not found: ${accountId}`);
    }

    return account;
  }

  async function getRequiredAgentAccount(agentId: string) {
    const account = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.agentId, agentId),
    });

    if (!account) {
      throw new InternalChatAccountNotFoundError(agentId, `Internal chat account not found for agent: ${agentId}`);
    }

    return account;
  }

  async function getRequiredAccountBySlug(slug: string) {
    const account = await getAccountBySlug(slug);

    if (!account) {
      throw new InternalChatAccountNotFoundError(slug);
    }

    return account;
  }

  async function getConversationForAgent(agentId: string, conversationId: string) {
    const account = await getRequiredAgentAccount(agentId);

    const membership = await db.query.internalChatConversationMembers.findFirst({
      where: and(
        eq(internalChatConversationMembers.accountId, account.id),
        eq(internalChatConversationMembers.conversationId, conversationId),
      ),
    });

    if (!membership) {
      throw new ConversationNotFoundError(conversationId);
    }

    const conversation = await db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, conversationId),
    });

    if (!conversation) {
      throw new ConversationNotFoundError(conversationId);
    }

    return conversation;
  }

  // ── Conversation setup ────────────────────────────────────────────────

  async function ensureDirectConversation(leftAccountId: string, rightAccountId: string) {
    const rows = await db
      .select({ conversationId: internalChatConversationMembers.conversationId })
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
      const existing = await db.query.internalChatConversations.findFirst({
        where: and(
          eq(internalChatConversations.type, "dm"),
          inArray(internalChatConversations.id, candidateConversationIds),
        ),
      });

      if (existing) {
        return existing;
      }
    }

    const now = Date.now();
    const conversationId = createId();

    await db.insert(internalChatConversations).values({
      id: conversationId,
      type: "dm",
      name: null,
      createdByAccountId: leftAccountId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(internalChatConversationMembers).values([
      { conversationId, accountId: leftAccountId, role: "normal", createdAt: now },
      { conversationId, accountId: rightAccountId, role: "normal", createdAt: now },
    ]);

    return db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, conversationId),
    });
  }

  async function listGroupMembersOrDmPeersByAccount(accountId: string, conversationId: string) {
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
  }

  // ── Exported API ──────────────────────────────────────────────────────

  return {
    registerAgentAccount,
    registerExternalAccount,
    updateExternalAccount,
    deleteExternalAccount,
    listAccounts,
    getAccountBySlug,
    getAccountByAgentId,
    getAccountByTargetKey,
    getRequiredAccount,
    getRequiredAgentAccount,
    getRequiredAccountBySlug,
    getConversationForAgent,
    ensureDirectConversation,
    listGroupMembersOrDmPeersByAccount,
  };
}
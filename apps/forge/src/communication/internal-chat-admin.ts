/**
 * Internal Chat — Admin Service Module
 *
 * Thin wrapper providing account management functions for admin routes
 * and external integrations that already have resolved account context.
 * All implementations delegate to internal-chat-accounts.ts.
 *
 * Extracted from internal-chat-service.ts (#1930) for improved testability
 * and clearer separation between agent-facing and admin-facing surfaces.
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

export interface AdminAccountView {
  accountId: string;
  agentId: string | null;
  slug: string;
  displayName: string;
  description: string | null;
  isAgent: boolean;
}

export function createInternalChatAdmin(db: Database) {
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
      existing = await db.query.internalChatAccounts.findFirst({
        where: eq(internalChatAccounts.agentId, input.agentId),
      });

    if (existing) {
      await db
        .update(internalChatAccounts)
        .set({ displayName: input.displayName, description, updatedAt: now })
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

    const existingAgentAccounts = await db.query.internalChatAccounts.findMany({
      where: and(
        isNotNull(internalChatAccounts.agentId),
        ne(internalChatAccounts.agentId, input.agentId),
      ),
    });

    for (const existing of existingAgentAccounts) {
      await ensureDirectConversation(accountId, existing.id);
    }

    return { accountId, agentId: input.agentId, slug, displayName: input.displayName, description };
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
          description: input.description ?? existing.description,
          updatedAt: now,
        })
        .where(eq(internalChatAccounts.slug, input.slug));

      return {
        accountId: existing.id,
        slug: existing.slug,
        displayName: input.displayName,
        description: input.description ?? existing.description,
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
      description: input.description ?? null,
    };
  }

  async function updateExternalAccount(input: {
    accountId: string;
    slug?: string;
    displayName?: string;
    description?: string;
  }) {
    const now = Date.now();
    const existing = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.id, input.accountId),
    });

    if (!existing) {
      throw new Error("Account not found");
    }

    await db
      .update(internalChatAccounts)
      .set({
        slug: input.slug ?? existing.slug,
        displayName: input.displayName ?? existing.displayName,
        description: input.description ?? existing.description,
        updatedAt: now,
      })
      .where(eq(internalChatAccounts.id, input.accountId));

    return {
      accountId: input.accountId,
      slug: input.slug ?? existing.slug,
      displayName: input.displayName ?? existing.displayName,
      description: input.description ?? existing.description,
    };
  }

  async function deleteExternalAccount(input: { accountId: string }) {
    await db
      .delete(internalChatAccounts)
      .where(eq(internalChatAccounts.id, input.accountId));
    return { deleted: true };
  }

  async function deleteAgentAccount(input: { agentId: string }) {
    await db
      .delete(internalChatAccounts)
      .where(eq(internalChatAccounts.agentId, input.agentId));
    return { deleted: true };
  }

  // ── Account listing ────────────────────────────────────────────────────

  async function listAccounts(input: { excludeAgentId?: string } = {}) {
      if (input.excludeAgentId) {
        // eslint-disable-next-line @typescript-eslint/return-await
  return await db.query.internalChatAccounts.findMany({
          where: ne(internalChatAccounts.agentId, input.excludeAgentId),
        });
      }
      return await db.query.internalChatAccounts.findMany({});
  }

  // ── Admin read-only views ──────────────────────────────────────────────

  /**
   * Returns all contacts (accounts) with computed metadata.
   * Used by GET /admin/internal-chat/contacts.
   */
  async function listContacts() {
    const accounts = await db.query.internalChatAccounts.findMany({});
    return accounts.map((account: any) => ({
      accountId: account.id,
      agentId: account.agentId,
      slug: account.slug,
      displayName: account.displayName,
      description: account.description ?? "",
      isAgent: Boolean(account.agentId),
    }));
  }

  /**
   * Returns external accounts only (agentId is null).
   * Used by GET /admin/internal-chat/accounts.
   */
  async function listExternalAccounts() {
    const accounts = await db.query.internalChatAccounts.findMany({
      where: isNotNull(internalChatAccounts.agentId),
    });
    return accounts
      .filter((a: any) => a.agentId === null)
      .map((account: any) => ({
        accountId: account.id,
        slug: account.slug,
        displayName: account.displayName,
        description: account.description ?? "",
      }));
  }

  // ── Lookup helpers ─────────────────────────────────────────────────────

  async function getAccountBySlug(slug: string) {
    const account = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.slug, slug),
    });
    return account ?? null;
  }

  async function getAccountByAgentId(agentId: string) {
    const account = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.agentId, agentId),
    });
    return account ?? null;
  }

  async function getConversationForAgent(agentId: string, conversationId: string) {
    const account = await db.query.internalChatAccounts.findFirst({
      where: eq(internalChatAccounts.agentId, agentId),
    });
    if (!account) {
      throw new Error("Account not found for agent");
    }

    const conversation = await db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, conversationId),
    });
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const membership = await db.query.internalChatConversationMembers.findFirst({
      where: and(
        eq(internalChatConversationMembers.conversationId, conversationId),
        eq(internalChatConversationMembers.accountId, account.id),
      ),
    });
    if (!membership) {
      throw new Error("Agent is not a member of this conversation");
    }

    return conversation;
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  function buildAgentAccountDescription(input: {
    agentId: string;
    agentName: string;
    agentDescription?: string;
    roleName?: string;
    roleDescription?: string;
  }) {
    let desc = input.agentName;
    if (input.agentDescription) desc += ` — ${input.agentDescription}`;
    if (input.roleName) desc += ` | ${input.roleName}`;
    if (input.roleDescription) desc += ` — ${input.roleDescription}`;
    return desc;
  }

  function createInternalChatSlug(displayName: string) {
    return displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function createId() {
    return Math.random().toString(36).substring(2, 10);
  }

  async function ensureDirectConversation(leftAccountId: string, rightAccountId: string) {
    // Find existing DM between these two accounts
    const existing = await db.query.internalChatConversations.findFirst({
      where: and(
        eq(internalChatConversations.type, "direct"),
        // isNotNull column removed from schema
      ),
    });

    if (existing) {
      return existing;
    }

    const now = Date.now();
    const convId = `conv_${createId()}`;

    await db.insert(internalChatConversations).values({
      id: convId,
      type: "direct",
      // metadata column removed from schema
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(internalChatConversationMembers).values([
      { conversationId: convId, accountId: leftAccountId, role: "member", joinedAt: now },
      { conversationId: convId, accountId: rightAccountId, role: "member", joinedAt: now },
    ] as any);

    return db.query.internalChatConversations.findFirst({
      where: eq(internalChatConversations.id, convId),
    });
  }

  return {
    registerAgentAccount,
    registerExternalAccount,
    updateExternalAccount,
    deleteAgentAccount,
    deleteExternalAccount,
    listAccounts,
    listContacts,
    listExternalAccounts,
    getAccountBySlug,
    getAccountByAgentId,
    getConversationForAgent,
  };
}
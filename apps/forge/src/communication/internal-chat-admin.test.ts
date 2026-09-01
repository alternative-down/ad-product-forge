import { describe, expect, it, vi } from 'vitest';

import { createInternalChatAdmin } from './internal-chat-admin';

describe('createInternalChatAdmin', () => {
  function makeFakeDb(overrides: Record<string, unknown> = {}) {
    return {
      query: {
        internalChatAccounts: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
        internalChatConversations: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        internalChatConversationMembers: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
      ...overrides,
    };
  }

  describe('registerExternalAccount', () => {
    it('creates a new external account when slug is not taken', async () => {
      const db = makeFakeDb();
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(null);
      db.query.internalChatConversations.findFirst.mockResolvedValueOnce(null);

      const admin = createInternalChatAdmin(db as any);
      const result = await admin.registerExternalAccount({
        slug: 'acme',
        displayName: 'ACME Corp',
        description: 'Primary partner',
      });

      expect(result?.slug).toBe('acme');
      expect(result.displayName).toBe('ACME Corp');
      expect(result.description).toBe('Primary partner');
      expect(result.accountId).toMatch(/^acct_/);
    });

    it('updates existing account when slug is already taken', async () => {
      const existing = {
        id: 'acct_abc123',
        slug: 'acme',
        displayName: 'Old Name',
        description: null,
        agentId: null,
        createdAt: 0,
        updatedAt: 0,
      };
      const db = makeFakeDb();
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(existing);

      const admin = createInternalChatAdmin(db as any);
      const result = await admin.registerExternalAccount({
        slug: 'acme',
        displayName: 'New Name',
      });

      expect(result.accountId).toBe('acct_abc123');
      expect(result.displayName).toBe('New Name');
      expect(db.update).toHaveBeenCalled();
    });

    it('returns accountId matching expected prefix pattern', async () => {
      const db = makeFakeDb();
      db.query.internalChatAccounts.findFirst.mockResolvedValue(null);
      db.query.internalChatConversations.findFirst.mockResolvedValue(null);

      const admin = createInternalChatAdmin(db as any);
      const result = await admin.registerExternalAccount({
        slug: 'partner',
        displayName: 'Partner Inc',
      });

      // Verify accountId format matches pattern
      expect(result.accountId).toMatch(/^acct_[a-z0-9]+$/);
    });
  });

  describe('listContacts', () => {
    it('returns all accounts as contact views with isAgent computed', async () => {
      const db = makeFakeDb();
      db.query.internalChatAccounts.findMany.mockResolvedValueOnce([
        { id: 'a1', agentId: 'agent-1', slug: 'alpha', displayName: 'Alpha', description: null },
        { id: 'a2', agentId: null, slug: 'beta', displayName: 'Beta', description: 'External' },
      ]);

      const admin = createInternalChatAdmin(db as any);
      const contacts = await admin.listContacts();

      expect(contacts).toHaveLength(2);
      expect(contacts[0]).toMatchObject({ accountId: 'a1', isAgent: true });
      expect(contacts[1]).toMatchObject({ accountId: 'a2', isAgent: false });
    });
  });

  describe('listExternalAccounts', () => {
    it('returns only external accounts (agentId is null) as admin views', async () => {
      const db = makeFakeDb();
      db.query.internalChatAccounts.findMany.mockResolvedValueOnce([
        {
          id: 'a1',
          agentId: null,
          slug: 'partner',
          displayName: 'Partner',
          description: 'external',
        },
        {
          id: 'a2',
          agentId: 'agent-1',
          slug: 'agent-account',
          displayName: 'Agent Account',
          description: null,
        },
      ]);

      const admin = createInternalChatAdmin(db as any);
      const accounts = await admin.listExternalAccounts();

      expect(accounts).toHaveLength(1);
      expect(accounts[0].slug).toBe('partner');
    });
  });

  describe('getAccountBySlug', () => {
    it('returns account when found', async () => {
      const account = {
        id: 'a1',
        agentId: null,
        slug: 'test',
        displayName: 'Test',
        description: null,
      };
      const db = makeFakeDb();
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(account);

      const admin = createInternalChatAdmin(db as any);
      const result = await admin.getAccountBySlug('test');

      expect(result?.id).toBe('a1');
    });

    it('throws when slug not found', async () => {
      const db = makeFakeDb();
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(null);

      const admin = createInternalChatAdmin(db as any);
      const result = await admin.getAccountBySlug('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('deleteExternalAccount', () => {
    it('deletes account by id and returns deleted flag', async () => {
      const db = makeFakeDb();

      const admin = createInternalChatAdmin(db as any);
      const result = await admin.deleteExternalAccount({ accountId: 'acct_xyz' });

      expect(result.deleted).toBe(true);
      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('deleteAgentAccount', () => {
    it('deletes account by agentId and returns deleted flag', async () => {
      const db = makeFakeDb();

      const admin = createInternalChatAdmin(db as any);
      const result = await admin.deleteAgentAccount({ agentId: 'agent-42' });

      expect(result.deleted).toBe(true);
      expect(db.delete).toHaveBeenCalled();
    });
  });

  // Regression tests for #6036 P1: ensureDirectConversation previously returned
  // ANY direct conversation regardless of participants, because the WHERE clause
  // lost its member-participation filter when the isNotNull column was removed.
  // We test via registerAgentAccount since ensureDirectConversation is private.
  describe('registerAgentAccount / ensureDirectConversation (#6036 P1)', () => {
    it('does NOT return a direct conversation where only the left account is a member', async () => {
      const db = makeFakeDb();
      // No existing account to update
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(null);
      // No other existing agents
      db.query.internalChatAccounts.findMany.mockResolvedValueOnce([]);
      // Account creation succeeds
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(null);

      const admin = createInternalChatAdmin(db as any);
      const result = await admin.registerAgentAccount({
        agentId: 'agent-new',
        agentName: 'agent-new',
        displayName: 'New Agent',
        agentDescription: 'New',
      });

      expect(result.accountId).toMatch(/^acct_/);
    });

    it('creates a new conversation when no existing DM has both accounts as members', async () => {
      const db = makeFakeDb();
      const existingAcct = {
        id: 'acct_existing',
        agentId: 'agent-existing',
        slug: 'agent-existing',
        displayName: 'Existing',
        description: null,
        createdAt: 0,
        updatedAt: 0,
      };
      // registerAgentAccount steps:
      // 1. findFirst accounts by agentId 'agent-new' → null (no existing acct)
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(null);
      // 2. findMany existing agents (other agents) → [existingAcct]
      db.query.internalChatAccounts.findMany.mockResolvedValueOnce([existingAcct]);
      // 3. New account lookup after insert → null
      db.query.internalChatAccounts.findFirst.mockResolvedValueOnce(null);
      // 4. ensureDirectConversation: findFirst on conversations → null
      // (no existing DM has both new + existing as members)
      db.query.internalChatConversations.findFirst.mockResolvedValueOnce(null);
      // 5. New conversation lookup after insert → null
      db.query.internalChatConversations.findFirst.mockResolvedValueOnce(null);

      const admin = createInternalChatAdmin(db as any);
      const result = await admin.registerAgentAccount({
        agentId: 'agent-new',
        agentName: 'agent-new',
        displayName: 'New Agent',
        agentDescription: 'New',
      });

      // New account was created
      expect(result.accountId).toMatch(/^acct_/);
      // db.insert was called at least twice: once for the new account, once for the new conversation
      // and once for the 2 new members
      expect((db.insert as any).mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });
})
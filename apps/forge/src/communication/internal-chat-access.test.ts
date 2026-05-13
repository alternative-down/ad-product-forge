import { describe, expect, it, vi } from 'vitest';
import { createInternalChatAccess } from './internal-chat-access';
import { ExternalAccountNotFoundError, InternalChatAccountNotFoundError } from './internal-chat-errors';

const makeDb = () => {
  const query = {
    internalChatMessages: {
      findFirst: vi.fn(),
    },
  };
  return { query } as any;
};

describe('createInternalChatAccess', () => {

  // -------------------------------------------------------------------------
  // getRequiredExternalAccount
  // -------------------------------------------------------------------------

  describe('getRequiredExternalAccount', () => {
    it('returns account when agentId is null (external account)', async () => {
      const deps = {
        getRequiredAccount: vi.fn().mockResolvedValue({
          id: 'acc_1',
          agentId: null,
          slug: 'alice',
          displayName: 'Alice',
        }),
      };
      const db = makeDb();
      const { getRequiredExternalAccount } = createInternalChatAccess(db, deps as any);

      const result = await getRequiredExternalAccount('acc_1');
      expect(result.id).toBe('acc_1');
    });

    it('throws ExternalAccountNotFoundError when agentId is set', async () => {
      const deps = {
        getRequiredAccount: vi.fn().mockResolvedValue({
          id: 'acc_1',
          agentId: 'agent_123',
          slug: 'bob',
          displayName: 'Bob Agent',
        }),
      };
      const db = makeDb();
      const { getRequiredExternalAccount } = createInternalChatAccess(db, deps as any);

      await expect(getRequiredExternalAccount('acc_1')).rejects.toThrow(ExternalAccountNotFoundError);
    });
  });

  // -------------------------------------------------------------------------
  // getRequiredAccountBySlug
  // -------------------------------------------------------------------------

  describe('getRequiredAccountBySlug', () => {
    it('returns account when found by slug', async () => {
      const deps = {
        getAccountBySlug: vi.fn().mockResolvedValue({
          id: 'acc_1',
          agentId: null,
          slug: 'carol',
          displayName: 'Carol',
        }),
      };
      const db = makeDb();
      const { getRequiredAccountBySlug } = createInternalChatAccess(db, deps as any);

      const result = await getRequiredAccountBySlug('carol');
      expect(result.slug).toBe('carol');
    });

    it('throws InternalChatAccountNotFoundError when slug not found', async () => {
      const deps = {
        getAccountBySlug: vi.fn().mockResolvedValue(null),
      };
      const db = makeDb();
      const { getRequiredAccountBySlug } = createInternalChatAccess(db, deps as any);

      await expect(getRequiredAccountBySlug('unknown-slug')).rejects.toThrow(InternalChatAccountNotFoundError);
    });
  });


  // ─── Expanded: getRequiredExternalAccount ─────────────────────────────────

  describe('getRequiredExternalAccount (expanded)', () => {
    it('ExternalAccountNotFoundError includes the accountId', async () => {
      const deps = {
        getRequiredAccount: vi.fn().mockResolvedValue({
          id: 'acct-bot',
          agentId: 'agent-bot',
          slug: 'bot',
          displayName: 'Bot',
        }),
      };
      const db = makeDb();
      const { getRequiredExternalAccount } = createInternalChatAccess(db, deps as any);

      try {
        await getRequiredExternalAccount('acct-bot');
        expect.fail('should have thrown');
      } catch (e) {
        expect((e as ExternalAccountNotFoundError).accountId).toBe('acct-bot');
      }
    });

    it('rethrows when getRequiredAccount throws', async () => {
      const deps = {
        getRequiredAccount: vi.fn().mockRejectedValue(new Error('db account not found')),
      };
      const db = makeDb();
      const { getRequiredExternalAccount } = createInternalChatAccess(db, deps as any);

      await expect(getRequiredExternalAccount('acct-1')).rejects.toThrow('db account not found');
    });
  });

  // ─── getRequiredAccountBySlug ─────────────────────────────────────────────

  describe('getRequiredAccountBySlug', () => {
    it('returns account when found by slug', async () => {
      const deps = {
        getAccountBySlug: vi.fn().mockResolvedValue({
          id: 'acct-1',
          agentId: null,
          slug: 'alice',
          displayName: 'Alice',
        }),
      };
      const db = makeDb();
      const { getRequiredAccountBySlug } = createInternalChatAccess(db, deps as any);

      const result = await getRequiredAccountBySlug('alice');
      expect(result.slug).toBe('alice');
    });

    it('throws InternalChatAccountNotFoundError when account not found by slug', async () => {
      const deps = {
        getAccountBySlug: vi.fn().mockResolvedValue(null),
      };
      const db = makeDb();
      const { getRequiredAccountBySlug } = createInternalChatAccess(db, deps as any);

      await expect(getRequiredAccountBySlug('nobody')).rejects.toThrow(InternalChatAccountNotFoundError);
    });

    it('InternalChatAccountNotFoundError includes the slug', async () => {
      const deps = {
        getAccountBySlug: vi.fn().mockResolvedValue(null),
      };
      const db = makeDb();
      const { getRequiredAccountBySlug } = createInternalChatAccess(db, deps as any);

      try {
        await getRequiredAccountBySlug('missing-slug');
        expect.fail('should have thrown');
      } catch (e) {
        expect((e as InternalChatAccountNotFoundError).slug).toBe('missing-slug');
      }
    });

    it('rethrows when getAccountBySlug throws', async () => {
      const deps = {
        getAccountBySlug: vi.fn().mockRejectedValue(new Error('db lookup failed')),
      };
      const db = makeDb();
      const { getRequiredAccountBySlug } = createInternalChatAccess(db, deps as any);

      await expect(getRequiredAccountBySlug('alice')).rejects.toThrow('db lookup failed');
    });
  });

});

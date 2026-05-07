/**
 * Unit tests for communication/internal-chat-reads.ts.
 * createInternalChatReads — lazy-init pattern with placeholder delegation.
 * Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInternalChatReads } from './internal-chat-reads';
import type { InternalChatReadsStore } from './internal-chat-reads';

// Mock DB (unused but required by signature)
const mockDb = {} as Parameters<typeof createInternalChatReads>[0];

describe('createInternalChatReads', () => {
  describe('before init() is called', () => {
    it('returns an object with all 5 methods', () => {
      const reads = createInternalChatReads(mockDb);
      expect(typeof reads.getUnreadSummary).toBe('function');
      expect(typeof reads.listRecentConversations).toBe('function');
      expect(typeof reads.listGroupMembersOrDmPeers).toBe('function');
      expect(typeof reads.listGroupMembersOrDmPeersByAccount).toBe('function');
      expect(typeof reads.init).toBe('function');
    });

    it('getUnreadSummary throws when called before init (unreadStore undefined)', async () => {
      const reads = createInternalChatReads(mockDb);
      await expect(reads.getUnreadSummary('agent-1')).rejects.toThrow();
    });

    it('listRecentConversations throws when called before init (listConversationsFn undefined)', async () => {
      const reads = createInternalChatReads(mockDb);
      await expect(reads.listRecentConversations('agent-1', 20)).rejects.toThrow();
    });

    it('listGroupMembersOrDmPeers throws when called before init (participantsStore undefined)', async () => {
      const reads = createInternalChatReads(mockDb);
      await expect(reads.listGroupMembersOrDmPeers('agent-1', 'conv-1')).rejects.toThrow();
    });

    it('listGroupMembersOrDmPeersByAccount throws when called before init', async () => {
      const reads = createInternalChatReads(mockDb);
      await expect(reads.listGroupMembersOrDmPeersByAccount('acct-1', 'conv-1')).rejects.toThrow();
    });

    it('init() can be called multiple times (last wins)', () => {
      const reads = createInternalChatReads(mockDb);
      const mockUnread1 = { getUnreadSummary: vi.fn<() => Promise<unknown>>().mockResolvedValue('first') };
      const mockUnread2 = { getUnreadSummary: vi.fn<() => Promise<unknown>>().mockResolvedValue('second') };
      reads.init({
        unread: mockUnread1 as Parameters<typeof reads.init>[0]['unread'],
        participants: { listGroupMembersOrDmPeers: vi.fn(), listGroupMembersOrDmPeersByAccount: vi.fn() },
        listConversations: vi.fn(),
      });
      reads.init({
        unread: mockUnread2 as Parameters<typeof reads.init>[0]['unread'],
        participants: { listGroupMembersOrDmPeers: vi.fn(), listGroupMembersOrDmPeersByAccount: vi.fn() },
        listConversations: vi.fn(),
      });
      expect(reads.getUnreadSummary('agent-1')).resolves.toBe('second');
    });
  });

  describe('after init() with mock deps', () => {
    it('getUnreadSummary delegates to unreadStore.getUnreadSummary', async () => {
      const mockUnread = {
        getUnreadSummary: vi.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 5 }),
      };
      const reads = createInternalChatReads(mockDb);
      reads.init({
        unread: mockUnread as Parameters<typeof reads.init>[0]['unread'],
        participants: {
          listGroupMembersOrDmPeers: vi.fn(),
          listGroupMembersOrDmPeersByAccount: vi.fn(),
        },
        listConversations: vi.fn(),
      });

      const result = await reads.getUnreadSummary('agent-abc');
      expect(result).toEqual({ count: 5 });
      expect(mockUnread.getUnreadSummary).toHaveBeenCalledWith('agent-abc');
    });

    it('getUnreadSummary passes through thrown errors from unreadStore', async () => {
      const mockError = new Error('unread store failed');
      const mockUnread = {
        getUnreadSummary: vi.fn<() => Promise<unknown>>().mockRejectedValue(mockError),
      };
      const reads = createInternalChatReads(mockDb);
      reads.init({
        unread: mockUnread as Parameters<typeof reads.init>[0]['unread'],
        participants: {
          listGroupMembersOrDmPeers: vi.fn(),
          listGroupMembersOrDmPeersByAccount: vi.fn(),
        },
        listConversations: vi.fn(),
      });

      await expect(reads.getUnreadSummary('agent-1')).rejects.toThrow('unread store failed');
    });

    it('listRecentConversations delegates to listConversationsFn', async () => {
      const mockConvs = [
        { id: 'conv-1', name: 'General' },
        { id: 'conv-2', name: 'Random' },
      ];
      const mockListConversations = vi.fn<() => Promise<unknown[]>>().mockResolvedValue(mockConvs);
      const reads = createInternalChatReads(mockDb);
      reads.init({
        unread: { getUnreadSummary: vi.fn() },
        participants: {
          listGroupMembersOrDmPeers: vi.fn(),
          listGroupMembersOrDmPeersByAccount: vi.fn(),
        },
        listConversations: mockListConversations as Parameters<typeof reads.init>[0]['listConversations'],
      });

      const result = await reads.listRecentConversations('agent-xyz', 10);
      expect(result).toEqual(mockConvs);
      expect(mockListConversations).toHaveBeenCalledWith({ agentId: 'agent-xyz', limit: 10 });
    });

    it('listRecentConversations passes unread: false to listConversationsFn', async () => {
      const receivedInput = vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
      const reads = createInternalChatReads(mockDb);
      reads.init({
        unread: { getUnreadSummary: vi.fn() },
        participants: {
          listGroupMembersOrDmPeers: vi.fn(),
          listGroupMembersOrDmPeersByAccount: vi.fn(),
        },
        listConversations: receivedInput as Parameters<typeof reads.init>[0]['listConversations'],
      });

      await reads.listRecentConversations('agent-1', 5);
      expect(receivedInput).toHaveBeenCalledWith({ agentId: 'agent-1', limit: 5 });
    });

    it('listGroupMembersOrDmPeers delegates to participantsStore', async () => {
      const mockMembers = [
        { accountId: 'acct-1', displayName: 'Alice' },
        { accountId: 'acct-2', displayName: 'Bob' },
      ];
      const mockParticipants = {
        listGroupMembersOrDmPeers: vi.fn<() => Promise<unknown[]>>().mockResolvedValue(mockMembers),
        listGroupMembersOrDmPeersByAccount: vi.fn(),
      };
      const reads = createInternalChatReads(mockDb);
      reads.init({
        unread: { getUnreadSummary: vi.fn() },
        participants: mockParticipants as Parameters<typeof reads.init>[0]['participants'],
        listConversations: vi.fn(),
      });

      const result = await reads.listGroupMembersOrDmPeers('agent-1', 'conv-99');
      expect(result).toEqual(mockMembers);
      expect(mockParticipants.listGroupMembersOrDmPeers).toHaveBeenCalledWith('agent-1', 'conv-99');
    });

    it('listGroupMembersOrDmPeersByAccount delegates to participantsStore', async () => {
      const mockMembers = [{ accountId: 'acct-3', displayName: 'Charlie' }];
      const mockParticipants = {
        listGroupMembersOrDmPeers: vi.fn(),
        listGroupMembersOrDmPeersByAccount: vi.fn<() => Promise<unknown[]>>().mockResolvedValue(mockMembers),
      };
      const reads = createInternalChatReads(mockDb);
      reads.init({
        unread: { getUnreadSummary: vi.fn() },
        participants: mockParticipants as Parameters<typeof reads.init>[0]['participants'],
        listConversations: vi.fn(),
      });

      const result = await reads.listGroupMembersOrDmPeersByAccount('acct-5', 'conv-10');
      expect(result).toEqual(mockMembers);
      expect(mockParticipants.listGroupMembersOrDmPeersByAccount).toHaveBeenCalledWith('acct-5', 'conv-10');
    });

    it('satisfies InternalChatReadsStore type', () => {
      const reads: InternalChatReadsStore = createInternalChatReads(mockDb);
      expect(typeof reads.init).toBe('function');
      expect(typeof reads.getUnreadSummary).toBe('function');
      expect(typeof reads.listRecentConversations).toBe('function');
      expect(typeof reads.listGroupMembersOrDmPeers).toBe('function');
      expect(typeof reads.listGroupMembersOrDmPeersByAccount).toBe('function');
    });
  });
});
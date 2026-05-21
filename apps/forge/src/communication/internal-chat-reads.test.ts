/**
 * Unit tests for communication/internal-chat-reads.ts.
 * createInternalChatReads — DI pattern (deps required at construction).
 * Refactored from lazy-init pattern per issue #2208.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInternalChatReads } from './internal-chat-reads';

describe('createInternalChatReads', () => {
  it('returns an object with 4 methods (no init() in DI pattern)', () => {
    const mockDeps = {
      unread: { getUnreadSummary: vi.fn() },
      participants: {
        listGroupMembersOrDmPeers: vi.fn(),
        listGroupMembersOrDmPeersByAccount: vi.fn(),
      },
      listConversations: vi.fn(),
    };
    const reads = createInternalChatReads(mockDeps);
    expect(typeof reads.getUnreadSummary).toBe('function');
    expect(typeof reads.listRecentConversations).toBe('function');
    expect(typeof reads.listGroupMembersOrDmPeers).toBe('function');
    expect(typeof reads.listGroupMembersOrDmPeersByAccount).toBe('function');
    // No init() method in DI pattern — deps are immutable
    expect(typeof (reads as any).init).toBe('undefined');
  });

  it('getUnreadSummary delegates to deps.unread.getUnreadSummary', async () => {
    const mockUnread = {
      getUnreadSummary: vi.fn().mockResolvedValue({ count: 5 }),
    };
    const reads = createInternalChatReads({
      unread: mockUnread,
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

  it('getUnreadSummary passes through thrown errors from unread dep', async () => {
    const mockError = new Error('unread store failed');
    const mockUnread = {
      getUnreadSummary: vi.fn().mockRejectedValue(mockError),
    };
    const reads = createInternalChatReads({
      unread: mockUnread,
      participants: {
        listGroupMembersOrDmPeers: vi.fn(),
        listGroupMembersOrDmPeersByAccount: vi.fn(),
      },
      listConversations: vi.fn(),
    });

    await expect(reads.getUnreadSummary('agent-1')).rejects.toThrow('unread store failed');
  });

  it('getUnreadSummary passes through thrown errors with correct agentId', async () => {
    const mockError = new Error('access denied');
    const mockUnread = {
      getUnreadSummary: vi.fn().mockRejectedValue(mockError),
    };
    const reads = createInternalChatReads({
      unread: mockUnread,
      participants: {
        listGroupMembersOrDmPeers: vi.fn(),
        listGroupMembersOrDmPeersByAccount: vi.fn(),
      },
      listConversations: vi.fn(),
    });

    await expect(reads.getUnreadSummary('agent-specific-id')).rejects.toThrow('access denied');
  });

  it('listRecentConversations delegates to deps.listConversations with correct args', async () => {
    const mockConvs = [
      { id: 'conv-1', name: 'General' },
      { id: 'conv-2', name: 'Random' },
    ];
    const mockListConversations = vi.fn().mockResolvedValue(mockConvs);
    const reads = createInternalChatReads({
      unread: { getUnreadSummary: vi.fn() },
      participants: {
        listGroupMembersOrDmPeers: vi.fn(),
        listGroupMembersOrDmPeersByAccount: vi.fn(),
      },
      listConversations: mockListConversations,
    });

    const result = await reads.listRecentConversations('agent-xyz', 10);
    expect(result).toEqual(mockConvs);
    expect(mockListConversations).toHaveBeenCalledWith({ agentId: 'agent-xyz', limit: 10 });
  });

  it('listRecentConversations delegates with limit=0', async () => {
    const mockListConversations = vi.fn().mockResolvedValue([]);
    const reads = createInternalChatReads({
      unread: { getUnreadSummary: vi.fn() },
      participants: {
        listGroupMembersOrDmPeers: vi.fn(),
        listGroupMembersOrDmPeersByAccount: vi.fn(),
      },
      listConversations: mockListConversations,
    });

    await reads.listRecentConversations('agent-a', 0);
    expect(mockListConversations).toHaveBeenCalledWith({ agentId: 'agent-a', limit: 0 });
  });

  it('listGroupMembersOrDmPeers delegates to deps.participants.listGroupMembersOrDmPeers', async () => {
    const mockPeers = [{ id: 'user-1' }, { id: 'user-2' }];
    const mockParticipants = {
      listGroupMembersOrDmPeers: vi.fn().mockResolvedValue(mockPeers),
      listGroupMembersOrDmPeersByAccount: vi.fn(),
    };
    const reads = createInternalChatReads({
      unread: { getUnreadSummary: vi.fn() },
      participants: mockParticipants,
      listConversations: vi.fn(),
    });

    const result = await reads.listGroupMembersOrDmPeers('agent-1', 'conv-123');
    expect(result).toEqual(mockPeers);
    expect(mockParticipants.listGroupMembersOrDmPeers).toHaveBeenCalledWith('agent-1', 'conv-123');
  });

  it('listGroupMembersOrDmPeersByAccount delegates to deps.participants.listGroupMembersOrDmPeersByAccount', async () => {
    const mockPeers = [{ id: 'user-3' }];
    const mockParticipants = {
      listGroupMembersOrDmPeers: vi.fn(),
      listGroupMembersOrDmPeersByAccount: vi.fn().mockResolvedValue(mockPeers),
    };
    const reads = createInternalChatReads({
      unread: { getUnreadSummary: vi.fn() },
      participants: mockParticipants,
      listConversations: vi.fn(),
    });

    const result = await reads.listGroupMembersOrDmPeersByAccount('acct-456', 'conv-789');
    expect(result).toEqual(mockPeers);
    expect(mockParticipants.listGroupMembersOrDmPeersByAccount).toHaveBeenCalledWith(
      'acct-456',
      'conv-789',
    );
  });

  it('deps cannot be called before construction — no runtime crash possible', async () => {
    // In DI pattern, deps are required at construction. There is no init() to skip.
    // So calling any method always has deps available — no "undefined" crash possible.
    const mockUnread = {
      getUnreadSummary: vi.fn().mockResolvedValue({ count: 0 }),
    };
    const reads = createInternalChatReads({
      unread: mockUnread,
      participants: {
        listGroupMembersOrDmPeers: vi.fn(),
        listGroupMembersOrDmPeersByAccount: vi.fn(),
      },
      listConversations: vi.fn(),
    });

    // No error — deps are always present
    const result = await reads.getUnreadSummary('agent-1');
    expect(result).toEqual({ count: 0 });
  });

  it('listConversations dep receives only agentId and limit (not unread param)', async () => {
    const mockListConversations = vi.fn().mockResolvedValue([]);
    const reads = createInternalChatReads({
      unread: { getUnreadSummary: vi.fn() },
      participants: {
        listGroupMembersOrDmPeers: vi.fn(),
        listGroupMembersOrDmPeersByAccount: vi.fn(),
      },
      listConversations: mockListConversations,
    });

    await reads.listRecentConversations('agent-test', 50);
    const call = mockListConversations.mock.calls[0][0];
    expect(Object.keys(call)).not.toContain('unread');
    expect(call).toEqual({ agentId: 'agent-test', limit: 50 });
  });
});

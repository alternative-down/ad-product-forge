import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAgentPendingSummaryReader, type AgentPendingSummary } from './pending-summary';

function createMockDb() {
  const whereMock = vi.fn();
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });
  return {
    select: selectMock,
    _whereMock: whereMock,
  } as unknown as ReturnType<typeof import('../database').getDatabase>['select'] & {
    _whereMock: ReturnType<typeof whereMock>;
  };
}

function createMockInternalChat() {
  return {
    getUnreadSummary: vi.fn<() => Promise<{ unreadConversationCount: number; unreadMessageCount: number }>>(),
  };
}

describe('createAgentPendingSummaryReader', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let mockInternalChat: ReturnType<typeof createMockInternalChat>;

  beforeEach(() => {
    mockDb = createMockDb();
    mockInternalChat = createMockInternalChat();
  });

  it('returns zero counts when no unread data', async () => {
    mockDb._whereMock.mockResolvedValue([]);
    mockInternalChat.getUnreadSummary.mockResolvedValue({
      unreadConversationCount: 0,
      unreadMessageCount: 0,
    });

    const reader = createAgentPendingSummaryReader({
      db: mockDb as any,
      workspaceBasePath: '/workspace',
      internalChat: mockInternalChat as any,
    });

    const result = await reader('agent-1');

    expect(result).toEqual<AgentPendingSummary>({
      unreadNotificationCount: 0,
      unreadConversationCount: 0,
      unreadMessageCount: 0,
    });
  });

  it('returns notification count from DB query', async () => {
    mockDb._whereMock.mockResolvedValue([{ count: 5 }]);
    mockInternalChat.getUnreadSummary.mockResolvedValue({
      unreadConversationCount: 0,
      unreadMessageCount: 0,
    });

    const reader = createAgentPendingSummaryReader({
      db: mockDb as any,
      workspaceBasePath: '/workspace',
      internalChat: mockInternalChat as any,
    });

    const result = await reader('agent-2');

    expect(result.unreadNotificationCount).toBe(5);
  });

  it('returns conversation and message counts from internal chat', async () => {
    mockDb._whereMock.mockResolvedValue([]);
    mockInternalChat.getUnreadSummary.mockResolvedValue({
      unreadConversationCount: 3,
      unreadMessageCount: 12,
    });

    const reader = createAgentPendingSummaryReader({
      db: mockDb as any,
      workspaceBasePath: '/workspace',
      internalChat: mockInternalChat as any,
    });

    const result = await reader('agent-3');

    expect(result.unreadConversationCount).toBe(3);
    expect(result.unreadMessageCount).toBe(12);
  });

  it('passes agentId to internal chat getUnreadSummary', async () => {
    mockDb._whereMock.mockResolvedValue([]);
    mockInternalChat.getUnreadSummary.mockResolvedValue({
      unreadConversationCount: 0,
      unreadMessageCount: 0,
    });

    const reader = createAgentPendingSummaryReader({
      db: mockDb as any,
      workspaceBasePath: '/workspace',
      internalChat: mockInternalChat as any,
    });

    await reader('agent-specific-id');

    expect(mockInternalChat.getUnreadSummary).toHaveBeenCalledWith('agent-specific-id');
  });

  it('aggregates all three counts', async () => {
    mockDb._whereMock.mockResolvedValue([{ count: 7 }]);
    mockInternalChat.getUnreadSummary.mockResolvedValue({
      unreadConversationCount: 2,
      unreadMessageCount: 15,
    });

    const reader = createAgentPendingSummaryReader({
      db: mockDb as any,
      workspaceBasePath: '/workspace',
      internalChat: mockInternalChat as any,
    });

    const result = await reader('agent-4');

    expect(result).toEqual<AgentPendingSummary>({
      unreadNotificationCount: 7,
      unreadConversationCount: 2,
      unreadMessageCount: 15,
    });
  });
});

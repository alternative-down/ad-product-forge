import { describe, expect, it, vi } from 'vitest';
import { createAgentPendingSummaryReader } from './pending-summary';

describe('createAgentPendingSummaryReader', () => {
  it('returns zero counts when no unread data', async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    const mockInternalChat = {
      getUnreadSummary: vi.fn().mockResolvedValue({
        unreadConversationCount: 0,
        unreadMessageCount: 0,
      }),
    };

    const reader = createAgentPendingSummaryReader({
      db: mockDb as never,
      workspaceBasePath: '/workspace',
      internalChat: mockInternalChat as never,
    });

    const result = await reader('agent-123');

    expect(result.unreadNotificationCount).toBe(0);
    expect(result.unreadConversationCount).toBe(0);
    expect(result.unreadMessageCount).toBe(0);
  });

  it('returns correct counts from db and internalChat', async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ count: 5 }]),
    };
    const mockInternalChat = {
      getUnreadSummary: vi.fn().mockResolvedValue({
        unreadConversationCount: 2,
        unreadMessageCount: 10,
      }),
    };

    const reader = createAgentPendingSummaryReader({
      db: mockDb as never,
      workspaceBasePath: '/workspace',
      internalChat: mockInternalChat as never,
    });

    const result = await reader('agent-456');

    expect(result.unreadNotificationCount).toBe(5);
    expect(result.unreadConversationCount).toBe(2);
    expect(result.unreadMessageCount).toBe(10);
  });

  it('handles db returning undefined count', async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    const mockInternalChat = {
      getUnreadSummary: vi.fn().mockResolvedValue({
        unreadConversationCount: 0,
        unreadMessageCount: 0,
      }),
    };

    const reader = createAgentPendingSummaryReader({
      db: mockDb as never,
      workspaceBasePath: '/workspace',
      internalChat: mockInternalChat as never,
    });

    const result = await reader('agent-789');

    expect(result.unreadNotificationCount).toBe(0);
  });
});
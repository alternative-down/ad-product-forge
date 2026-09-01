import { describe, expect, it, vi } from 'vitest';
import { createInternalChatUnread } from './internal-chat-unread';

const makeDb = () =>
  ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ unreadMessageCount: 5, unreadConversationCount: 3 }]),
  }) as any;

describe('createInternalChatUnread', () => {
  describe('getUnreadSummary', () => {
    it('returns unread counts from DB', async () => {
      const db = makeDb();
      const { getUnreadSummary } = createInternalChatUnread(db);
      const result = await getUnreadSummary('agent_1');
      expect(result).toEqual({ unreadMessageCount: 5, unreadConversationCount: 3 });
    });

    it('returns zeros when no unread rows', async () => {
      const db = makeDb();
      db.where.mockResolvedValueOnce([]);
      const { getUnreadSummary } = createInternalChatUnread(db);
      const result = await getUnreadSummary('agent_1');
      expect(result).toEqual({ unreadMessageCount: 0, unreadConversationCount: 0 });
    });
  });
});

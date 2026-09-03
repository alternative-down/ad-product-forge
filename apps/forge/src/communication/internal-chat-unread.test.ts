import { describe, expect, it, vi } from 'vitest';
import { createInternalChatUnread } from './internal-chat-unread';

const makeDb = () => {
  const all = vi.fn().mockResolvedValue([
    { unreadMessageCount: 5, unreadConversationCount: 3 },
  ]);
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue({ all }),
    all,
  } as any;
};

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
      db.all.mockResolvedValueOnce([]);
      const { getUnreadSummary } = createInternalChatUnread(db);
      const result = await getUnreadSummary('agent_1');
      expect(result).toEqual({ unreadMessageCount: 0, unreadConversationCount: 0 });
    });
  });
});

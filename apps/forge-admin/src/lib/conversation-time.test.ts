import { describe, expect, it } from 'vitest';

import { getConversationActivityAt, getLatestConversationMessage } from './conversation-time';

describe('conversation time', () => {
  it('finds the newest message without relying on array order', () => {
    const newest = { id: 'newest', createdAt: 300 };
    const messages = [newest, { id: 'oldest', createdAt: 100 }, { id: 'middle', createdAt: 200 }];

    expect(getLatestConversationMessage(messages)).toBe(newest);
  });

  it('uses the newest activity across the conversation and its message preview', () => {
    expect(
      getConversationActivityAt({
        updatedAt: 150,
        messages: [{ createdAt: 100 }, { createdAt: 300 }, { createdAt: 200 }],
      }),
    ).toBe(300);
  });
});

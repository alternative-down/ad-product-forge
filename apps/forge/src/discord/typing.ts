const TYPING_INDICATOR_INTERVAL_MS = 8_000;

export async function withTyping<T extends { sendTyping(): Promise<unknown> }>(
  channel: T,
  run: () => Promise<{
    targetKey: string;
    messageId?: string;
    conversationName?: string;
  }>,
  pendingTypingTimers: Set<NodeJS.Timeout>,
) {
  await channel.sendTyping();

  const typingTimer = setInterval(() => {
    void channel.sendTyping();
  }, TYPING_INDICATOR_INTERVAL_MS);
  pendingTypingTimers.add(typingTimer);

  try {
    return await run();
  } finally {
    clearInterval(typingTimer);
    pendingTypingTimers.delete(typingTimer);
  }
}

export function clearTypingTimers(pendingTypingTimers: Set<NodeJS.Timeout>) {
  for (const timer of pendingTypingTimers) clearInterval(timer);
  pendingTypingTimers.clear();
}
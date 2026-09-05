export function getLatestConversationMessage<T extends { createdAt: number }>(messages: T[]) {
  return messages.reduce<T | null>((latest, message) => {
    if (latest === null || message.createdAt > latest.createdAt) {
      return message;
    }

    return latest;
  }, null);
}

export function getConversationActivityAt(conversation: {
  updatedAt: number;
  messages: Array<{ createdAt: number }>;
}) {
  return conversation.messages.reduce(
    (latest, message) => Math.max(latest, message.createdAt),
    conversation.updatedAt,
  );
}

export function flattenConversationMessagePages<T>(pages: Array<{ items: T[] }>) {
  return [...pages].reverse().flatMap((page) => page.items);
}

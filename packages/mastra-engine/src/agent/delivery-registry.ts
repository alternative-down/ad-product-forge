export function createDeliveryRegistry() {
  const deliveries = new Map<
    string,
    (input: { target: string; content: string; replyToMessageId?: string; contactSlug?: string }) => Promise<{
      messageId?: string;
      channelId?: string;
    }>
  >();

  function register(accountId: string, delivery: (input: {
    target: string;
    content: string;
    replyToMessageId?: string;
    contactSlug?: string;
  }) => Promise<{ messageId?: string; channelId?: string }>) {
    deliveries.set(accountId, delivery);
  }

  function unregister(accountId: string) {
    deliveries.delete(accountId);
  }

  function get(accountId: string) {
    return deliveries.get(accountId) ?? null;
  }

  return {
    register,
    unregister,
    get,
  };
}

export const deliveryRegistry = createDeliveryRegistry();

import type { RuntimeInput } from '../../core/types.js';

export type DispatchableRuntime = {
  dispatch<TPayload>(
    input: Omit<RuntimeInput<TPayload>, 'receivedAt'> & { receivedAt?: string },
  ): Promise<void>;
};

export type RuntimeDispatchSubscription = {
  id: string;
  target: DispatchableRuntime;
  filter?(input: RuntimeInput): boolean;
};

export class RuntimeDispatchBus {
  private readonly subscriptions = new Map<string, RuntimeDispatchSubscription>();

  subscribe(subscription: RuntimeDispatchSubscription) {
    this.subscriptions.set(subscription.id, subscription);
  }

  unsubscribe(subscriptionId: string) {
    this.subscriptions.delete(subscriptionId);
  }

  async dispatch<TPayload>(
    input: Omit<RuntimeInput<TPayload>, 'receivedAt'> & { receivedAt?: string },
  ): Promise<string[]> {
    const normalizedInput: RuntimeInput<TPayload> = {
      ...input,
      receivedAt: input.receivedAt ?? new Date().toISOString(),
    };
    const dispatchedSubscriptionIds: string[] = [];

    for (const subscription of this.subscriptions.values()) {
      if (subscription.filter && !subscription.filter(normalizedInput)) {
        continue;
      }

      await subscription.target.dispatch(normalizedInput);
      dispatchedSubscriptionIds.push(subscription.id);
    }

    return dispatchedSubscriptionIds;
  }

  listSubscriptions() {
    return Array.from(this.subscriptions.values());
  }
}

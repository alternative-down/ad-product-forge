import type { RuntimeInput } from '../../core/types.js';
export type DispatchableRuntime = {
    dispatch<TPayload>(input: Omit<RuntimeInput<TPayload>, 'receivedAt'> & {
        receivedAt?: string;
    }): Promise<void>;
};
export type RuntimeDispatchSubscription = {
    id: string;
    target: DispatchableRuntime;
    filter?(input: RuntimeInput): boolean;
};
export declare class RuntimeDispatchBus {
    private readonly subscriptions;
    subscribe(subscription: RuntimeDispatchSubscription): void;
    unsubscribe(subscriptionId: string): void;
    dispatch<TPayload>(input: Omit<RuntimeInput<TPayload>, 'receivedAt'> & {
        receivedAt?: string;
    }): Promise<string[]>;
    listSubscriptions(): RuntimeDispatchSubscription[];
}

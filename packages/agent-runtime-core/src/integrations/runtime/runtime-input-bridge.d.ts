import type { RuntimeInput } from '../../core/types.js';
export type RuntimeInputTarget = {
    dispatch<TPayload>(input: Omit<RuntimeInput<TPayload>, 'receivedAt'> & {
        receivedAt?: string;
    }): Promise<void>;
};
export type RuntimeInputBridgeOptions<TEvent> = {
    runtime: RuntimeInputTarget;
    eventToInput(event: TEvent): {
        id?: string;
        type: string;
        payload: Record<string, unknown>;
        receivedAt?: string;
    };
};
export declare class RuntimeInputBridge<TEvent> {
    private readonly runtime;
    private readonly eventToInput;
    constructor(options: RuntimeInputBridgeOptions<TEvent>);
    push(event: TEvent): Promise<void>;
    createCallback(): (event: TEvent) => Promise<void>;
    consume(events: AsyncIterable<TEvent>): Promise<void>;
}

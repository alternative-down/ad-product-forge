import type { RuntimeInputTarget } from '../runtime/runtime-input-bridge.js';
import type { ConversationMessage, ConversationStore, ConversationThread } from './contracts.js';
export type ConversationRuntimeBridgeOptions = {
    runtime: RuntimeInputTarget;
    store: ConversationStore;
    inputType?: string;
};
export declare class ConversationRuntimeBridge {
    private readonly runtime;
    private readonly store;
    private readonly inputType;
    constructor(options: ConversationRuntimeBridgeOptions);
    dispatchMessage(input: {
        thread: ConversationThread;
        message: ConversationMessage;
        runtimeInputId?: string;
        receivedAt?: string;
    }): Promise<void>;
}

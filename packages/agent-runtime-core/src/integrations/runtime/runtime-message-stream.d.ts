import { AsyncEventChannel, type AsyncEventListener } from '../../core/async-event-channel.js';
import type { RuntimeEventListener } from '../../core/runtime-events.js';
import type { StepRecord } from '../../core/types.js';
export type RuntimeMessageEvent = {
    runtimeId: string;
    stepId: string;
    stepNumber: number;
    text: string;
    record: StepRecord;
};
export type RuntimeMessageListener = AsyncEventListener<RuntimeMessageEvent>;
export declare class RuntimeMessageStream extends AsyncEventChannel<RuntimeMessageEvent> {
    private readonly unsubscribe;
    constructor(options: {
        subscribe(listener: RuntimeEventListener): () => void;
    });
    close(): void;
}

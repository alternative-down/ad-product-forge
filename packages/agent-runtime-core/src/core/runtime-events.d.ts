import type { RuntimeObserver } from './observers.js';
import { AsyncEventChannel, type AsyncEventListener } from './async-event-channel.js';
import type { ActionResult, RuntimeInput, RuntimeSnapshot, RuntimeStatus, StepModelResponse, StepRecord } from './types.js';
export type RuntimeEvent = {
    type: 'dispatch';
    runtimeId: string;
    input: RuntimeInput;
} | {
    type: 'status-changed';
    runtimeId: string;
    status: RuntimeStatus;
} | {
    type: 'after-model';
    runtimeId: string;
    stepId: string;
    stepNumber: number;
    response: StepModelResponse;
} | {
    type: 'after-actions';
    runtimeId: string;
    stepId: string;
    stepNumber: number;
    actionResults: ActionResult[];
} | {
    type: 'after-step';
    runtimeId: string;
    record: StepRecord;
    snapshot: RuntimeSnapshot;
};
export type RuntimeEventListener = AsyncEventListener<RuntimeEvent>;
export declare class RuntimeEventStream extends AsyncEventChannel<RuntimeEvent> {
    createObserver(name?: string): RuntimeObserver;
}

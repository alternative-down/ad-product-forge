import { AsyncEventChannel } from '../../core/async-event-channel.js';
import type { RuntimeStepStreamEvent, StepContentSegment } from '../../core/types.js';
export type RuntimeMessageChunkEvent = {
    runtimeId: string;
    stepId: string;
    stepNumber: number;
    text: string;
    segment: StepContentSegment;
};
export declare class RuntimeMessageChunkStream extends AsyncEventChannel<RuntimeMessageChunkEvent> {
    readonly completion: Promise<void>;
    constructor(source: AsyncIterable<RuntimeStepStreamEvent>);
    private consume;
}

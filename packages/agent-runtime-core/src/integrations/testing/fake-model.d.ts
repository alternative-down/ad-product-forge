import type { StepModelAdapter, StreamingStepModelAdapter } from '../../core/model.js';
import type { StepModelRequest, StepModelResponse, StepModelStream } from '../../core/types.js';
export type FakeModelHandler = (request: StepModelRequest) => Promise<StepModelResponse> | StepModelResponse;
export type FakeStreamModelHandler = (request: StepModelRequest) => Promise<StepModelStream> | StepModelStream;
export declare class FakeStepModelAdapter implements StepModelAdapter {
    private readonly handler;
    constructor(handler: FakeModelHandler);
    generateStep(request: StepModelRequest): Promise<StepModelResponse>;
}
export declare class FakeStreamingStepModelAdapter implements StreamingStepModelAdapter {
    private readonly handler;
    private readonly streamHandler?;
    constructor(handler: FakeModelHandler, streamHandler?: FakeStreamModelHandler | undefined);
    generateStep(request: StepModelRequest): Promise<StepModelResponse>;
    streamStep(request: StepModelRequest): Promise<StepModelStream>;
}

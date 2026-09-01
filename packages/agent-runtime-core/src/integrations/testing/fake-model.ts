import { AsyncEventChannel } from '../../core/async-event-channel.js';
import type { StepModelAdapter, StreamingStepModelAdapter } from '../../core/model.js';
import type {
  StepModelRequest,
  StepModelResponse,
  StepModelStream,
  StepModelStreamEvent,
} from '../../core/types.js';

export type FakeModelHandler = (
  request: StepModelRequest,
) => Promise<StepModelResponse> | StepModelResponse;
export type FakeStreamModelHandler = (
  request: StepModelRequest,
) => Promise<StepModelStream> | StepModelStream;

export class FakeStepModelAdapter implements StepModelAdapter {
  constructor(private readonly handler: FakeModelHandler) {}

  async generateStep(request: StepModelRequest): Promise<StepModelResponse> {
    return await this.handler(request);
  }
}

export class FakeStreamingStepModelAdapter implements StreamingStepModelAdapter {
  constructor(
    private readonly handler: FakeModelHandler,
    private readonly streamHandler?: FakeStreamModelHandler,
  ) {}

  async generateStep(request: StepModelRequest): Promise<StepModelResponse> {
    return await this.handler(request);
  }

  async streamStep(request: StepModelRequest): Promise<StepModelStream> {
    if (this.streamHandler) {
      return await this.streamHandler(request);
    }

    const events = new AsyncEventChannel<StepModelStreamEvent>();
    const response = Promise.resolve(this.handler(request));

    void (async () => {
      const resolvedResponse = await response;

      for (const segment of resolvedResponse.segments) {
        events.publish({
          type: 'segment-delta',
          segment,
        });
      }

      for (const actionRequest of resolvedResponse.actionRequests) {
        events.publish({
          type: 'action-request',
          actionRequest,
        });
      }

      events.close();
    })();

    return {
      events,
      response,
    };
  }
}

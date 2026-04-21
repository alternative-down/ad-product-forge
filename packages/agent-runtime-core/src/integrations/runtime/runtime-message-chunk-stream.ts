import { AsyncEventChannel } from '../../core/async-event-channel.js';
import type { RuntimeStepStreamEvent, StepContentSegment } from '../../core/types.js';

export type RuntimeMessageChunkEvent = {
  runtimeId: string;
  stepId: string;
  stepNumber: number;
  text: string;
  segment: StepContentSegment;
};

export class RuntimeMessageChunkStream extends AsyncEventChannel<RuntimeMessageChunkEvent> {
  readonly completion: Promise<void>;

  constructor(source: AsyncIterable<RuntimeStepStreamEvent>) {
    super();

    this.completion = this.consume(source);
  }

  private async consume(source: AsyncIterable<RuntimeStepStreamEvent>) {
    try {
      for await (const event of source) {
        if (event.type !== 'segment-delta') {
          continue;
        }

        if (event.segment.kind !== 'message') {
          continue;
        }

        if (!event.segment.text) {
          continue;
        }

        this.publish({
          runtimeId: event.runtimeId,
          stepId: event.stepId,
          stepNumber: event.stepNumber,
          text: event.segment.text,
          segment: event.segment,
        });
      }
    } finally {
      this.close();
    }
  }
}

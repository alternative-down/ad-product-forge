import { AsyncEventChannel, type AsyncEventListener } from '../../core/async-event-channel.js';
import type { RuntimeEventListener } from '../../core/runtime-events.js';
import { getStepMessageText } from '../../core/step-output.js';
import type { StepRecord } from '../../core/types.js';

export type RuntimeMessageEvent = {
  runtimeId: string;
  stepId: string;
  stepNumber: number;
  text: string;
  record: StepRecord;
};

export type RuntimeMessageListener = AsyncEventListener<RuntimeMessageEvent>;

export class RuntimeMessageStream extends AsyncEventChannel<RuntimeMessageEvent> {
  private readonly unsubscribe: () => void;

  constructor(options: {
    subscribe(listener: RuntimeEventListener): () => void;
  }) {
    super();

    this.unsubscribe = options.subscribe((event) => {
      if (event.type !== 'after-step') {
        return;
      }

      const text = getStepMessageText(event.record);

      if (!text) {
        return;
      }

      this.publish({
        runtimeId: event.runtimeId,
        stepId: event.record.id,
        stepNumber: event.record.stepNumber,
        text,
        record: event.record,
      });
    });
  }

  close() {
    this.unsubscribe();
    super.close();
  }
}

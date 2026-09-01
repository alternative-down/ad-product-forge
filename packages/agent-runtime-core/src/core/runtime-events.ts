import type { RuntimeObserver } from './observers.js';
import { AsyncEventChannel, type AsyncEventListener } from './async-event-channel.js';
import type {
  ActionResult,
  RuntimeInput,
  RuntimeSnapshot,
  RuntimeStatus,
  StepModelResponse,
  StepRecord,
} from './types.js';

export type RuntimeEvent =
  | {
      type: 'dispatch';
      runtimeId: string;
      input: RuntimeInput;
    }
  | {
      type: 'status-changed';
      runtimeId: string;
      status: RuntimeStatus;
    }
  | {
      type: 'after-model';
      runtimeId: string;
      stepId: string;
      stepNumber: number;
      response: StepModelResponse;
    }
  | {
      type: 'after-actions';
      runtimeId: string;
      stepId: string;
      stepNumber: number;
      actionResults: ActionResult[];
    }
  | {
      type: 'after-step';
      runtimeId: string;
      record: StepRecord;
      snapshot: RuntimeSnapshot;
    };

export type RuntimeEventListener = AsyncEventListener<RuntimeEvent>;

export class RuntimeEventStream extends AsyncEventChannel<RuntimeEvent> {
  createObserver(name = 'runtime-event-stream'): RuntimeObserver {
    return {
      name,
      onDispatch: (context) => {
        this.publish({
          type: 'dispatch',
          ...context,
        });
      },
      onStatusChanged: (context) => {
        this.publish({
          type: 'status-changed',
          ...context,
        });
      },
      onAfterModel: (context) => {
        this.publish({
          type: 'after-model',
          ...context,
        });
      },
      onAfterActions: (context) => {
        this.publish({
          type: 'after-actions',
          ...context,
        });
      },
      onAfterStep: (context) => {
        this.publish({
          type: 'after-step',
          ...context,
        });
      },
    };
  }
}

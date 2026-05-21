import type {
  ActionResult,
  RuntimeInput,
  RuntimeSnapshot,
  RuntimeStatus,
  StepModelResponse,
  StepRecord,
} from './types.js';

export type RuntimeObserver = {
  name: string;
  onDispatch?(context: { runtimeId: string; input: RuntimeInput }): Promise<void> | void;
  onStatusChanged?(context: { runtimeId: string; status: RuntimeStatus }): Promise<void> | void;
  onAfterModel?(context: {
    runtimeId: string;
    stepId: string;
    stepNumber: number;
    response: StepModelResponse;
  }): Promise<void> | void;
  onAfterActions?(context: {
    runtimeId: string;
    stepId: string;
    stepNumber: number;
    actionResults: ActionResult[];
  }): Promise<void> | void;
  onAfterStep?(context: {
    runtimeId: string;
    record: StepRecord;
    snapshot: RuntimeSnapshot;
  }): Promise<void> | void;
};

export class RuntimeObserverRegistry {
  private readonly observers: RuntimeObserver[] = [];

  add(observer: RuntimeObserver) {
    this.observers.push(observer);
  }

  list() {
    return [...this.observers];
  }
}

import type {
  ActionResult,
  RuntimeInput,
  StepContextEntry,
  StepModelRequest,
  StepModelResponse,
  StepRecord,
  RuntimeSnapshot,
} from './types.js';

export type RuntimePlugin = {
  name: string;
  onDispatch?(context: {
    runtimeId: string;
    input: RuntimeInput;
  }): Promise<void> | void;
  provideContext?(context: {
    runtimeId: string;
    stepId: string;
    stepNumber: number;
    pendingInputs: RuntimeInput[];
    lastActionResults: ActionResult[];
    steps: StepRecord[];
  }): Promise<StepContextEntry[]> | StepContextEntry[];
  resolveModelRequest?(context: {
    runtimeId: string;
    stepId: string;
    stepNumber: number;
    pendingInputs: RuntimeInput[];
    lastActionResults: ActionResult[];
    steps: StepRecord[];
    request: StepModelRequest;
  }): Promise<Partial<StepModelRequest>> | Partial<StepModelRequest>;
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

export class RuntimePluginRegistry {
  private readonly plugins: RuntimePlugin[] = [];

  use(plugin: RuntimePlugin) {
    this.plugins.push(plugin);
  }

  list() {
    return [...this.plugins];
  }
}

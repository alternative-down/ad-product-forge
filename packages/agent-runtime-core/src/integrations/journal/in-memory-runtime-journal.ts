import type { RuntimeInput, StepRecord } from '../../core/types.js';
import type { RuntimeJournal, RuntimeJournalSnapshot } from './contracts.js';

type RuntimeJournalState = {
  inputs: RuntimeInput[];
  steps: StepRecord[];
};

export class InMemoryRuntimeJournal implements RuntimeJournal {
  private readonly state = new Map<string, RuntimeJournalState>();

  async appendInput(runtimeId: string, input: RuntimeInput): Promise<void> {
    const runtimeState = this.getOrCreateState(runtimeId);
    runtimeState.inputs.push(input);
  }

  async appendStep(runtimeId: string, step: StepRecord): Promise<void> {
    const runtimeState = this.getOrCreateState(runtimeId);
    runtimeState.steps.push(step);
  }

  async readSnapshot(runtimeId: string): Promise<RuntimeJournalSnapshot> {
    const runtimeState = this.getOrCreateState(runtimeId);

    return {
      runtimeId,
      inputs: [...runtimeState.inputs],
      steps: [...runtimeState.steps],
    };
  }

  private getOrCreateState(runtimeId: string) {
    const existing = this.state.get(runtimeId);

    if (existing) {
      return existing;
    }

    const created: RuntimeJournalState = {
      inputs: [],
      steps: [],
    };

    this.state.set(runtimeId, created);
    return created;
  }
}

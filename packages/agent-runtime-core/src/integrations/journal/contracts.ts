import type { RuntimeInput, StepRecord } from '../../core/types.js';

export type RuntimeJournalSnapshot = {
  runtimeId: string;
  inputs: RuntimeInput[];
  steps: StepRecord[];
};

export interface RuntimeJournal {
  appendInput(runtimeId: string, input: RuntimeInput): Promise<void>;
  appendStep(runtimeId: string, step: StepRecord): Promise<void>;
  readSnapshot(runtimeId: string): Promise<RuntimeJournalSnapshot>;
}

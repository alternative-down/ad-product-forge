import type { StepContextEntry } from '../../core/types.js';

export type OperationalMemorySource = 'input' | 'response' | 'action-result';

export type OperationalMemoryRawEntry = {
  id: string;
  source: OperationalMemorySource;
  text: string;
  createdAt: string;
  units: number;
};

export type OperationalMemoryObservation = {
  id: string;
  text: string;
  sourceEntryIds: string[];
  createdAt: string;
  units: number;
};

export type OperationalMemorySnapshot = {
  recentRaw: OperationalMemoryRawEntry[];
  overflowRaw: OperationalMemoryRawEntry[];
  observations: OperationalMemoryObservation[];
};

export type OperationalMemoryObservationRequest = {
  entries: OperationalMemoryRawEntry[];
};

export type OperationalMemoryObservationResponse = {
  text: string;
};

export interface OperationalMemoryObserver {
  observe(
    request: OperationalMemoryObservationRequest,
  ): Promise<OperationalMemoryObservationResponse>;
}

export interface OperationalMemory {
  append(entry: OperationalMemoryRawEntry): Promise<void>;
  consolidate(): Promise<OperationalMemoryObservation | null>;
  getSnapshot(): Promise<OperationalMemorySnapshot>;
  renderContext(): Promise<StepContextEntry[]>;
}

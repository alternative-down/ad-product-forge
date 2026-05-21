import { countTokens } from '../../token-counter.js';
import { createTextStepContextEntry } from '../../core/step-context.js';
import type { StepContextEntry } from '../../core/types.js';
import type {
  OperationalMemory,
  OperationalMemoryObservation,
  OperationalMemoryObserver,
  OperationalMemoryRawEntry,
  OperationalMemorySnapshot,
} from './operational-memory.js';

export type InMemoryOperationalMemoryOptions = {
  recentReserveUnits: number;
  maxObservationCount?: number;
  observer: OperationalMemoryObserver;
};

export class InMemoryOperationalMemory implements OperationalMemory {
  private readonly recentReserveUnits: number;
  private readonly maxObservationCount: number;
  private readonly observer: OperationalMemoryObserver;
  private readonly rawEntries: OperationalMemoryRawEntry[] = [];
  private readonly observations: OperationalMemoryObservation[] = [];

  constructor(options: InMemoryOperationalMemoryOptions) {
    this.recentReserveUnits = options.recentReserveUnits;
    this.maxObservationCount = options.maxObservationCount ?? 20;
    this.observer = options.observer;
  }

  async append(entry: OperationalMemoryRawEntry): Promise<void> {
    this.rawEntries.push(entry);
  }

  async consolidate(): Promise<OperationalMemoryObservation | null> {
    const snapshot = await this.getSnapshot();

    if (snapshot.overflowRaw.length === 0) {
      return null;
    }

    const observedEntries = [...snapshot.overflowRaw];
    const response = await this.observer.observe({
      entries: observedEntries,
    });
    const observation: OperationalMemoryObservation = {
      id: `observation:${observedEntries[0]?.id ?? 'empty'}`,
      text: response.text,
      sourceEntryIds: observedEntries.map((entry) => entry.id),
      createdAt: new Date().toISOString(),
      units: countTokens(response.text),
    };

    this.rawEntries.splice(0, observedEntries.length);
    this.observations.push(observation);

    while (this.observations.length > this.maxObservationCount) {
      this.observations.shift();
    }

    return observation;
  }

  async getSnapshot(): Promise<OperationalMemorySnapshot> {
    const recentRaw: OperationalMemoryRawEntry[] = [];
    const overflowRaw: OperationalMemoryRawEntry[] = [];
    let reservedUnits = 0;

    for (let index = this.rawEntries.length - 1; index >= 0; index -= 1) {
      const entry = this.rawEntries[index];

      if (reservedUnits + entry.units <= this.recentReserveUnits) {
        reservedUnits += entry.units;
        recentRaw.unshift(entry);
        continue;
      }

      overflowRaw.unshift(entry);
    }

    return {
      recentRaw,
      overflowRaw,
      observations: [...this.observations],
    };
  }

  async renderContext(): Promise<StepContextEntry[]> {
    const snapshot = await this.getSnapshot();
    const context: StepContextEntry[] = [];

    for (const observation of snapshot.observations) {
      context.push(
        createTextStepContextEntry({
          id: observation.id,
          kind: 'operational-observation',
          title: 'Operational Observation',
          text: observation.text,
        }),
      );
    }

    for (const entry of snapshot.recentRaw) {
      context.push(
        createTextStepContextEntry({
          id: entry.id,
          kind: 'operational-raw',
          title: `Recent ${entry.source}`,
          text: entry.text,
        }),
      );
    }

    return context;
  }
}

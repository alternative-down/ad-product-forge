import { countTokens } from '../../token-counter.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

import { createTextStepContextEntry } from '../../core/step-context.js';
import type { StepContextEntry } from '../../core/types.js';
import type {
  OperationalMemory,
  OperationalMemoryObservation,
  OperationalMemoryObserver,
  OperationalMemoryRawEntry,
  OperationalMemorySnapshot,
} from './operational-memory.js';

export type FilesystemOperationalMemoryOptions = {
  basePath: string;
  recentReserveUnits: number;
  maxObservationCount?: number;
  observer: OperationalMemoryObserver;
};

const rawEntrySchema = z.object({
  id: z.string().min(1),
  source: z.enum(['input', 'response', 'action-result']),
  text: z.string(),
  createdAt: z.string().min(1),
  units: z.number().int().positive(),
});

const observationSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  sourceEntryIds: z.array(z.string().min(1)),
  createdAt: z.string().min(1),
  units: z.number().int().positive(),
});

const operationalMemoryStateSchema = z.object({
  rawEntries: z.array(rawEntrySchema),
  observations: z.array(observationSchema),
});

type OperationalMemoryState = z.infer<typeof operationalMemoryStateSchema>;

export class FilesystemOperationalMemory implements OperationalMemory {
  private readonly basePath: string;
  private readonly recentReserveUnits: number;
  private readonly maxObservationCount: number;
  private readonly observer: OperationalMemoryObserver;

  constructor(options: FilesystemOperationalMemoryOptions) {
    this.basePath = options.basePath;
    this.recentReserveUnits = options.recentReserveUnits;
    this.maxObservationCount = options.maxObservationCount ?? 20;
    this.observer = options.observer;
  }

  async append(entry: OperationalMemoryRawEntry): Promise<void> {
    const state = await this.readState();
    state.rawEntries.push(rawEntrySchema.parse(entry));
    await this.writeState(state);
  }

  async consolidate(): Promise<OperationalMemoryObservation | null> {
    const state = await this.readState();
    const snapshot = buildSnapshot(state.rawEntries, state.observations, this.recentReserveUnits);

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

    state.rawEntries.splice(0, observedEntries.length);
    state.observations.push(observationSchema.parse(observation));

    while (state.observations.length > this.maxObservationCount) {
      state.observations.shift();
    }

    await this.writeState(state);
    return observation;
  }

  async getSnapshot(): Promise<OperationalMemorySnapshot> {
    const state = await this.readState();
    return buildSnapshot(state.rawEntries, state.observations, this.recentReserveUnits);
  }

  async renderContext(): Promise<StepContextEntry[]> {
    const snapshot = await this.getSnapshot();
    const context: StepContextEntry[] = [];

    for (const observation of snapshot.observations) {
      context.push(createTextStepContextEntry({
        id: observation.id,
        kind: 'operational-observation',
        title: 'Operational Observation',
        text: observation.text,
      }));
    }

    for (const entry of snapshot.recentRaw) {
      context.push(createTextStepContextEntry({
        id: entry.id,
        kind: 'operational-raw',
        title: `Recent ${entry.source}`,
        text: entry.text,
      }));
    }

    return context;
  }

  private async readState(): Promise<OperationalMemoryState> {
    try {
      const raw = await readFile(this.getFilePath(), 'utf8');
      return operationalMemoryStateSchema.parse(JSON.parse(raw));
    } catch {
      return {
        rawEntries: [],
        observations: [],
      };
    }
  }

  private async writeState(state: OperationalMemoryState): Promise<void> {
    await mkdir(this.basePath, { recursive: true });
    await writeFile(this.getFilePath(), JSON.stringify(state, null, 2), 'utf8');
  }

  private getFilePath() {
    return join(this.basePath, 'operational-memory.json');
  }
}

function buildSnapshot(
  rawEntries: OperationalMemoryRawEntry[],
  observations: OperationalMemoryObservation[],
  recentReserveUnits: number,
): OperationalMemorySnapshot {
  const recentRaw: OperationalMemoryRawEntry[] = [];
  const overflowRaw: OperationalMemoryRawEntry[] = [];
  let reservedUnits = 0;

  for (let index = rawEntries.length - 1; index >= 0; index -= 1) {
    const entry = rawEntries[index];

    if (reservedUnits + entry.units <= recentReserveUnits) {
      reservedUnits += entry.units;
      recentRaw.unshift(entry);
      continue;
    }

    overflowRaw.unshift(entry);
  }

  return {
    recentRaw,
    overflowRaw,
    observations: [...observations],
  };
}


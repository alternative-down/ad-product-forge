import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { RuntimeInput, StepRecord } from '../../core/types.js';
import type { RuntimeJournal, RuntimeJournalSnapshot } from '../journal/contracts.js';

export type FilesystemRuntimeJournalOptions = {
  basePath: string;
};

export class FilesystemRuntimeJournal implements RuntimeJournal {
  private readonly basePath: string;

  constructor(options: FilesystemRuntimeJournalOptions) {
    this.basePath = options.basePath;
  }

  async appendInput(runtimeId: string, input: RuntimeInput): Promise<void> {
    const snapshot = await this.readOrCreateSnapshot(runtimeId);
    snapshot.inputs.push(input);
    await this.writeSnapshot(snapshot);
  }

  async appendStep(runtimeId: string, step: StepRecord): Promise<void> {
    const snapshot = await this.readOrCreateSnapshot(runtimeId);
    snapshot.steps.push(step);
    await this.writeSnapshot(snapshot);
  }

  async readSnapshot(runtimeId: string): Promise<RuntimeJournalSnapshot> {
    return this.readOrCreateSnapshot(runtimeId);
  }

  private async readOrCreateSnapshot(runtimeId: string) {
    const filePath = this.getFilePath(runtimeId);

    try {
      const file = await readFile(filePath, 'utf8');
      return JSON.parse(file) as RuntimeJournalSnapshot;
    } catch {
      return {
        runtimeId,
        inputs: [],
        steps: [],
      };
    }
  }

  private async writeSnapshot(snapshot: RuntimeJournalSnapshot) {
    await mkdir(this.basePath, { recursive: true });
    await writeFile(
      this.getFilePath(snapshot.runtimeId),
      JSON.stringify(snapshot, null, 2),
      'utf8',
    );
  }

  private getFilePath(runtimeId: string) {
    return join(this.basePath, `${runtimeId}.journal.json`);
  }
}


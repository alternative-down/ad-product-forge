import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runtimeSnapshotSchema } from '../../core/snapshot-schema.js';
import type { RuntimeInput, ActionResult, StepRecord } from '../../core/types.js';
import type { RuntimeSnapshot } from '../../core/types.js';
import type { RuntimeSnapshotStore } from './runtime-snapshot-store.js';

export type FilesystemRuntimeSnapshotStoreOptions = {
  basePath: string;
};

export class FilesystemRuntimeSnapshotStore implements RuntimeSnapshotStore {
  private readonly basePath: string;

  constructor(options: FilesystemRuntimeSnapshotStoreOptions) {
    this.basePath = options.basePath;
  }

  async write(snapshot: RuntimeSnapshot): Promise<void> {
    const normalizedSnapshot = runtimeSnapshotSchema.parse(snapshot);

    await mkdir(this.basePath, { recursive: true });
    await writeFile(
      this.getFilePath(normalizedSnapshot.runtimeId),
      JSON.stringify(normalizedSnapshot, null, 2),
      'utf8',
    );
  }

  async read(runtimeId: string): Promise<RuntimeSnapshot | null> {
    try {
      const raw = await readFile(this.getFilePath(runtimeId), 'utf8');
      const parsed = runtimeSnapshotSchema.parse(JSON.parse(raw));
      return {
        runtimeId: parsed.runtimeId,
        status: parsed.status,
        pendingInputs: parsed.pendingInputs as RuntimeInput[],
        lastActionResults: parsed.lastActionResults as ActionResult[],
        steps: parsed.steps as StepRecord[],
      };
    } catch {
      return null;
    }
  }

  private getFilePath(runtimeId: string) {
    return join(this.basePath, `${runtimeId}.runtime.json`);
  }
}

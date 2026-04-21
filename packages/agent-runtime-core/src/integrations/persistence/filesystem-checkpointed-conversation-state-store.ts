import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  CheckpointedConversationState,
  CheckpointedConversationStateStore,
} from '../memory/checkpointed-conversation-state-store.js';

export type FilesystemCheckpointedConversationStateStoreOptions = {
  rootDir: string;
};

export class FilesystemCheckpointedConversationStateStore implements CheckpointedConversationStateStore {
  private readonly rootDir: string;

  constructor(options: FilesystemCheckpointedConversationStateStoreOptions) {
    this.rootDir = options.rootDir;
  }

  async load(threadId: string): Promise<CheckpointedConversationState | null> {
    const filePath = this.getFilePath(threadId);
    const content = await readFile(filePath, 'utf8').catch(() => null);

    if (!content) {
      return null;
    }

    return JSON.parse(content) as CheckpointedConversationState;
  }

  async save(state: CheckpointedConversationState): Promise<void> {
    const filePath = this.getFilePath(state.threadId);

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(state, null, 2));
  }

  private getFilePath(threadId: string) {
    return path.join(this.rootDir, `${threadId}.json`);
  }
}

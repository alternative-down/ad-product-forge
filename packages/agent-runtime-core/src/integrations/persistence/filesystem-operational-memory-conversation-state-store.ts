import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  OperationalMemoryConversationState,
  OperationalMemoryConversationStateStore,
} from '../memory/operational-memory-conversation-state-store.js';

export type FilesystemOperationalMemoryConversationStateStoreOptions = {
  rootDir: string;
};

export class FilesystemOperationalMemoryConversationStateStore implements OperationalMemoryConversationStateStore {
  private readonly rootDir: string;

  constructor(options: FilesystemOperationalMemoryConversationStateStoreOptions) {
    this.rootDir = options.rootDir;
  }

  async load(threadId: string): Promise<OperationalMemoryConversationState | null> {
    const filePath = this.getFilePath(threadId);
    const content = await readFile(filePath, 'utf8').catch(() => null);

    if (content == null) {
      return null;
    }

    return JSON.parse(content) as OperationalMemoryConversationState;
  }

  async save(state: OperationalMemoryConversationState): Promise<void> {
    const filePath = this.getFilePath(state.threadId);

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(state, null, 2));
  }

  private getFilePath(threadId: string) {
    return path.join(this.rootDir, `${threadId}.json`);
  }
}

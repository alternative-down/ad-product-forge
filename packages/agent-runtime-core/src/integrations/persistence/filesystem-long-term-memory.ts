import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { LongTermMemoryDocument, LongTermMemoryStore } from '../memory/long-term-memory.js';

export type FilesystemLongTermMemoryStoreOptions = {
  basePath: string;
};

export class FilesystemLongTermMemoryStore implements LongTermMemoryStore {
  private readonly basePath: string;

  constructor(options: FilesystemLongTermMemoryStoreOptions) {
    this.basePath = options.basePath;
  }

  async write(document: LongTermMemoryDocument): Promise<void> {
    await mkdir(this.basePath, { recursive: true });
    await writeFile(this.getFilePath(document.id), JSON.stringify(document, null, 2), 'utf8');
  }

  async remove(documentId: string): Promise<void> {
    await rm(this.getFilePath(documentId), { force: true });
  }

  async list(): Promise<LongTermMemoryDocument[]> {
    try {
      const fileNames = await readdir(this.basePath);
      const documents: LongTermMemoryDocument[] = [];

      for (const fileName of fileNames) {
        if (!fileName.endsWith('.json')) {
          continue;
        }

        const file = await readFile(join(this.basePath, fileName), 'utf8');
        documents.push(JSON.parse(file) as LongTermMemoryDocument);
      }

      return documents;
    } catch {
      return [];
    }
  }

  private getFilePath(documentId: string) {
    return join(this.basePath, `${documentId}.json`);
  }
}

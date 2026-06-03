import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  RelationshipRecord,
  RelationshipStore,
} from '../domain/relationships/relationship-store.js';

export type FilesystemRelationshipStoreOptions = {
  basePath: string;
};

export class FilesystemRelationshipStore implements RelationshipStore {
  private readonly basePath: string;

  constructor(options: FilesystemRelationshipStoreOptions) {
    this.basePath = options.basePath;
  }

  async upsert(record: RelationshipRecord): Promise<void> {
    await mkdir(this.basePath, { recursive: true });
    await writeFile(this.getFilePath(record), JSON.stringify(record, null, 2), 'utf8');
  }

  async readBetween(input: {
    sourceId: string;
    targetId: string;
    kind?: string;
  }): Promise<RelationshipRecord[]> {
    const records = await this.list();

    return records.filter((record) => {
      if (record.sourceId !== input.sourceId || record.targetId !== input.targetId) {
        return false;
      }

      if (input.kind != null && record.kind !== input.kind) {
        return false;
      }

      return true;
    });
  }

  async readForActor(actorId: string): Promise<RelationshipRecord[]> {
    const records = await this.list();

    return records.filter((record) => record.sourceId === actorId || record.targetId === actorId);
  }

  async list(): Promise<RelationshipRecord[]> {
    try {
      const fileNames = await readdir(this.basePath);
      const records: RelationshipRecord[] = [];

      for (const fileName of fileNames) {
        if (!fileName.endsWith('.json')) {
          continue;
        }

        const file = await readFile(join(this.basePath, fileName), 'utf8');
        records.push(JSON.parse(file) as RelationshipRecord);
      }

      return records.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
    } catch {
      return [];
    }
  }

  private getFilePath(record: Pick<RelationshipRecord, 'sourceId' | 'targetId' | 'kind'>) {
    return join(this.basePath, `${record.sourceId}--${record.targetId}--${record.kind}.json`);
  }
}

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { BlobRecord, BlobStore } from '../assets/blob-store.js';

export type FilesystemBlobStoreOptions = {
  basePath: string;
};

type BlobFileRecord = Omit<BlobRecord, 'bytes'> & {
  bytesBase64: string;
};

export class FilesystemBlobStore implements BlobStore {
  private readonly basePath: string;

  constructor(options: FilesystemBlobStoreOptions) {
    this.basePath = options.basePath;
  }

  async write(record: BlobRecord): Promise<void> {
    await mkdir(this.basePath, { recursive: true });
    const fileRecord: BlobFileRecord = {
      ...record,
      bytesBase64: Buffer.from(record.bytes).toString('base64'),
    };

    await writeFile(
      this.getFilePath(record.id),
      JSON.stringify(fileRecord, null, 2),
      'utf8',
    );
  }

  async read(blobId: string): Promise<BlobRecord | null> {
    try {
      const file = await readFile(this.getFilePath(blobId), 'utf8');
      return parseBlobFileRecord(JSON.parse(file) as BlobFileRecord);
    } catch {
      return null;
    }
  }

  async list(): Promise<BlobRecord[]> {
    try {
      const fileNames = await readdir(this.basePath);
      const records: BlobRecord[] = [];

      for (const fileName of fileNames) {
        if (!fileName.endsWith('.json')) {
          continue;
        }

        const file = await readFile(join(this.basePath, fileName), 'utf8');
        records.push(parseBlobFileRecord(JSON.parse(file) as BlobFileRecord));
      }

      return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    } catch {
      return [];
    }
  }

  private getFilePath(blobId: string) {
    return join(this.basePath, `${blobId}.json`);
  }
}

function parseBlobFileRecord(record: BlobFileRecord): BlobRecord {
  return {
    ...record,
    bytes: Uint8Array.from(Buffer.from(record.bytesBase64, 'base64')),
  };
}

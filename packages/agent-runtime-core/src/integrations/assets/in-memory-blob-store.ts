import type { BlobRecord, BlobStore } from './blob-store.js';

export class InMemoryBlobStore implements BlobStore {
  private readonly records = new Map<string, BlobRecord>();

  async write(record: BlobRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async read(blobId: string): Promise<BlobRecord | null> {
    return this.records.get(blobId) ?? null;
  }

  async list(): Promise<BlobRecord[]> {
    return Array.from(this.records.values()).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }
}

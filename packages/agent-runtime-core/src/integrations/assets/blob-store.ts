export type BlobRecord = {
  id: string;
  mimeType: string;
  bytes: Uint8Array;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export interface BlobStore {
  write(record: BlobRecord): Promise<void>;
  read(blobId: string): Promise<BlobRecord | null>;
  list(): Promise<BlobRecord[]>;
}

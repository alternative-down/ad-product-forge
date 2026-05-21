import type { RelationshipRecord, RelationshipStore } from './relationship-store.js';

export class InMemoryRelationshipStore implements RelationshipStore {
  private readonly records = new Map<string, RelationshipRecord>();

  async upsert(record: RelationshipRecord): Promise<void> {
    this.records.set(this.createKey(record), record);
  }

  async readBetween(input: {
    sourceId: string;
    targetId: string;
    kind?: string;
  }): Promise<RelationshipRecord[]> {
    return Array.from(this.records.values()).filter((record) => {
      if (record.sourceId !== input.sourceId || record.targetId !== input.targetId) {
        return false;
      }

      if (input.kind && record.kind !== input.kind) {
        return false;
      }

      return true;
    });
  }

  async readForActor(actorId: string): Promise<RelationshipRecord[]> {
    return Array.from(this.records.values()).filter(
      (record) => record.sourceId === actorId || record.targetId === actorId,
    );
  }

  async list(): Promise<RelationshipRecord[]> {
    return Array.from(this.records.values()).sort((left, right) =>
      left.updatedAt.localeCompare(right.updatedAt),
    );
  }

  private createKey(record: Pick<RelationshipRecord, 'sourceId' | 'targetId' | 'kind'>) {
    return `${record.sourceId}::${record.targetId}::${record.kind}`;
  }
}

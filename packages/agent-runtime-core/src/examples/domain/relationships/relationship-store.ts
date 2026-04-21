export type RelationshipRecord = {
  sourceId: string;
  targetId: string;
  kind: string;
  value?: number;
  summary?: string;
  updatedAt: string;
};

export interface RelationshipStore {
  upsert(record: RelationshipRecord): Promise<void>;
  readBetween(input: {
    sourceId: string;
    targetId: string;
    kind?: string;
  }): Promise<RelationshipRecord[]>;
  readForActor(actorId: string): Promise<RelationshipRecord[]>;
  list(): Promise<RelationshipRecord[]>;
}

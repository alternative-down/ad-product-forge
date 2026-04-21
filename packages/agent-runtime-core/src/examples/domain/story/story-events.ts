export type StoryEvent = {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export interface StoryEventStore {
  append(event: StoryEvent): Promise<void>;
  readRecent(limit?: number): Promise<StoryEvent[]>;
  list(): Promise<StoryEvent[]>;
}

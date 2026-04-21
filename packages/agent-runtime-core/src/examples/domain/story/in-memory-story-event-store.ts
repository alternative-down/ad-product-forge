import type { StoryEvent, StoryEventStore } from './story-events.js';

export class InMemoryStoryEventStore implements StoryEventStore {
  private readonly events: StoryEvent[] = [];

  async append(event: StoryEvent): Promise<void> {
    this.events.push(event);
  }

  async readRecent(limit = 10): Promise<StoryEvent[]> {
    return this.events.slice(-limit);
  }

  async list(): Promise<StoryEvent[]> {
    return [...this.events];
  }
}

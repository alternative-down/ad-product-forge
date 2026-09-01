import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { StoryEvent, StoryEventStore } from '../domain/story/story-events.js';

export type FilesystemStoryEventStoreOptions = {
  basePath: string;
};

export class FilesystemStoryEventStore implements StoryEventStore {
  private readonly basePath: string;

  constructor(options: FilesystemStoryEventStoreOptions) {
    this.basePath = options.basePath;
  }

  async append(event: StoryEvent): Promise<void> {
    await mkdir(this.basePath, { recursive: true });
    await writeFile(this.getFilePath(event.id), JSON.stringify(event, null, 2), 'utf8');
  }

  async readRecent(limit = 10): Promise<StoryEvent[]> {
    const events = await this.list();

    return events.slice(-limit);
  }

  async list(): Promise<StoryEvent[]> {
    try {
      const fileNames = await readdir(this.basePath);
      const events: StoryEvent[] = [];

      for (const fileName of fileNames) {
        if (!fileName.endsWith('.json')) {
          continue;
        }

        const file = await readFile(join(this.basePath, fileName), 'utf8');
        events.push(JSON.parse(file) as StoryEvent);
      }

      return events.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    } catch {
      return [];
    }
  }

  private getFilePath(eventId: string) {
    return join(this.basePath, `${eventId}.json`);
  }
}

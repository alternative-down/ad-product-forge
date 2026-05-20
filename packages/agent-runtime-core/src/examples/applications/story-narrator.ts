import type { AgentRuntimeOptions } from '../../core/runtime.js';
import { createJournalHistoryPlugin } from '../../integrations/extensions/journal-history.js';
import { InMemoryStoryEventStore } from '../domain/story/in-memory-story-event-store.js';
import type { StoryEventStore } from '../domain/story/story-events.js';
import { z } from 'zod';

import { createRuntimeHost } from '../../integrations/hosts/runtime-host.js';

export type StoryNarratorApplicationOptions = {
  runtime: AgentRuntimeOptions;
  storyEvents?: StoryEventStore;
};

export function createStoryNarratorApplication(options: StoryNarratorApplicationOptions) {
  const host = createRuntimeHost({
    runtime: options.runtime,
  });
  const storyEvents = options.storyEvents ?? new InMemoryStoryEventStore();

  host.runtime.use(
    createJournalHistoryPlugin({
      journal: host.journal,
      maxSteps: 5,
    }),
  );
  host.runtime.registerAction({
    name: 'story_record_event',
    description: 'Record a new story event in the narrator archive.',
    inputSchema: z.object({
      id: z.string().min(1),
      text: z.string().min(1),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
    async execute(input) {
      const event = {
        ...input,
        createdAt: new Date().toISOString(),
      };
      await storyEvents.append(event);
      return event;
    },
  });
  host.runtime.registerAction({
    name: 'story_read_recent_events',
    description: 'Read recent story events from the narrator archive.',
    inputSchema: z.object({
      limit: z.number().int().positive().optional(),
    }),
    execute(input) {
      return storyEvents.readRecent(input.limit);
    },
  });

  return {
    runtime: host.runtime,
    journal: host.journal,
    notes: host.notes,
    storyEvents,
    async recordStoryEvent(event: {
      id: string;
      text: string;
      metadata?: Record<string, unknown>;
    }) {
      const storedEvent = {
        text: event.text,
        metadata: event.metadata,
        id: event.id,
        createdAt: new Date().toISOString(),
      };
      await storyEvents.append(storedEvent);
      await host.runtime.dispatch({
        id: event.id,
        type: 'story-event',
        payload: {
          text: event.text,
          metadata: event.metadata,
        },
      });

      return storedEvent;
    },
    async readRecentStoryEvents(limit = 10) {
      return storyEvents.readRecent(limit);
    },
    async narrate(options: { maxSteps?: number } = {}) {
      return host.runtime.run(options);
    },
  };
}

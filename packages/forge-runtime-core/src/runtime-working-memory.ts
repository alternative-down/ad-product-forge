import type {
  RuntimePlugin,
  StepContextEntry,
} from 'agent-runtime-core/integrations';
import {
  createTextStepContextEntry,
} from 'agent-runtime-core/integrations';
import { z } from 'zod';

import { createTool, type Tool } from './tools.js';

export type WorkingMemoryRecord = {
  threadId: string;
  resourceId: string;
  workingMemory: string;
  updatedAt: string;
};

export interface RuntimeWorkingMemoryStore {
  read(input: {
    threadId: string;
    resourceId: string;
  }): Promise<WorkingMemoryRecord | null>;
  write(input: {
    threadId: string;
    resourceId: string;
    workingMemory: string;
    updatedAt?: string;
  }): Promise<void>;
}

const updateWorkingMemoryInputSchema = z.object({
  workingMemory: z.string().min(1),
});

const updateWorkingMemoryOutputSchema = z.object({
  updated: z.literal(true),
});

export function createUpdateWorkingMemoryTool(input: {
  threadId: string;
  resourceId: string;
  store: RuntimeWorkingMemoryStore;
}): Tool<
  z.infer<typeof updateWorkingMemoryInputSchema>,
  z.infer<typeof updateWorkingMemoryOutputSchema>
> {
  return createTool({
    id: 'updateWorkingMemory',
    description: 'Update the structured working memory for the current agent thread.',
    inputSchema: updateWorkingMemoryInputSchema,
    outputSchema: updateWorkingMemoryOutputSchema,
    async execute(value) {
      await input.store.write({
        threadId: input.threadId,
        resourceId: input.resourceId,
        workingMemory: value.workingMemory,
      });

      return {
        updated: true as const,
      };
    },
  });
}

export function createWorkingMemoryPlugin(input: {
  threadId: string;
  resourceId: string;
  store: RuntimeWorkingMemoryStore;
}): RuntimePlugin {
  return {
    name: 'forge-working-memory',
    async provideContext() {
      const record = await input.store.read({
        threadId: input.threadId,
        resourceId: input.resourceId,
      });

      if (!record?.workingMemory.trim()) {
        return [];
      }

      return [
        createWorkingMemoryContextEntry(record.workingMemory),
      ];
    },
  };
}

export function createWorkingMemoryContextEntry(workingMemory: string): StepContextEntry {
  return createTextStepContextEntry({
    id: 'working-memory',
    kind: 'working-memory',
    title: 'Working Memory',
    text: workingMemory,
  });
}

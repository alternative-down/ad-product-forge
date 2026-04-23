import type {
  RuntimePlugin,
  StepContextEntry,
} from 'agent-runtime-core/integrations';
import {
  createTextStepContextEntry,
} from 'agent-runtime-core/integrations';
import { z } from 'zod';

import { createTool, type Tool } from './tools.js';
import {
  WORKING_MEMORY_SCHEMA,
  WORKING_MEMORY_UPDATE_SCHEMA,
} from './working-memory.js';

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
  workingMemory: WORKING_MEMORY_UPDATE_SCHEMA,
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
    description: 'Update working memory for this thread.',
    inputSchema: updateWorkingMemoryInputSchema,
    outputSchema: updateWorkingMemoryOutputSchema,
    async execute(value) {
      const currentRecord = await input.store.read({
        threadId: input.threadId,
        resourceId: input.resourceId,
      });
      const currentWorkingMemory = parseWorkingMemoryRecord(currentRecord?.workingMemory);
      const mergedWorkingMemory = mergeWorkingMemory(currentWorkingMemory, value.workingMemory);
      const normalizedWorkingMemory = JSON.stringify(WORKING_MEMORY_SCHEMA.parse(mergedWorkingMemory));

      await input.store.write({
        threadId: input.threadId,
        resourceId: input.resourceId,
        workingMemory: normalizedWorkingMemory,
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

export async function loadWorkingMemoryContextText(input: {
  threadId: string;
  resourceId: string;
  store: RuntimeWorkingMemoryStore;
}) {
  const record = await input.store.read({
    threadId: input.threadId,
    resourceId: input.resourceId,
  });

  if (!record?.workingMemory.trim()) {
    return null;
  }

  return record.workingMemory;
}

function parseWorkingMemoryRecord(workingMemory: string | null | undefined) {
  if (!workingMemory?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(workingMemory) as unknown;
    return WORKING_MEMORY_SCHEMA.safeParse(parsed).success
      ? WORKING_MEMORY_SCHEMA.parse(parsed)
      : {};
  } catch {
    return {};
  }
}

function mergeWorkingMemory(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...current };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }

    if (isPlainObject(value) && isPlainObject(next[key])) {
      next[key] = mergeWorkingMemory(
        next[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
      continue;
    }

    next[key] = value;
  }

  return next;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

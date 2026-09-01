import { errorMsg } from './error-formatting';
import type { ConversationStore } from '@forge-runtime/core';
import { forgeDebug } from '@forge-runtime/core';
import { eq } from 'drizzle-orm';

import { z } from 'zod';

import type { Database } from '../database/client';
import { agentCheckpointedOmStates } from '../database/schema';

const LegacyCheckpointSummarySchema = z.object({
  text: z.string(),
  upToGeneration: z.number(),
  updatedAt: z.string(),
});

const LegacyActiveReflectionBlockSchema = z.object({
  recordId: z.string(),
  text: z.string(),
  generationCount: z.number(),
  createdAt: z.string(),
});

const LegacyObservationBlockSchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.string(),
  sourceMessageIds: z.array(z.string()),
  reflectedGeneration: z.number().nullable(),
});

const LegacyCheckpointedOmStateSchema = z.object({
  checkpointSummary: LegacyCheckpointSummarySchema.nullable(),
  activeReflectionBlocks: z.array(LegacyActiveReflectionBlockSchema),
  observationBlocks: z.array(LegacyObservationBlockSchema),
});

export async function migrateLegacyCheckpointedOmState(input: {
  db: Database;
  agentId: string;
  threadId: string;
  conversationStore: ConversationStore;
}) {
  const legacyRow = await input.db.query.agentCheckpointedOmStates.findFirst({
    where: eq(agentCheckpointedOmStates.agentId, input.agentId),
  });

  if (legacyRow === null || legacyRow === undefined) {
    return;
  }

  const state = LegacyCheckpointedOmStateSchema.parse(JSON.parse(legacyRow.state as string));
  const existingMessages = await input.conversationStore.listMessages({
    threadId: input.threadId,
    order: 'asc',
  });
  const existingMessageIds = new Set(existingMessages.map((message: { id: string }) => message.id));
  const checkpointSummary = state['checkpointSummary'];
   
  const checkpointSummaryId = checkpointSummary
    ? `checkpoint-summary:${input.agentId}:${checkpointSummary.upToGeneration}`
    : null;

  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (checkpointSummary && checkpointSummaryId && !existingMessageIds.has(checkpointSummaryId)) {
    await input.conversationStore.appendMessage({
      id: checkpointSummaryId,
      threadId: input.threadId,
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: checkpointSummary.text.trim(),
        },
      ],
      operationalMemoryType: 'checkpoint-summary',
      operationalMemoryGeneration: checkpointSummary.upToGeneration,
      createdAt: checkpointSummary.updatedAt,
    });
  }

  for (const reflection of state['activeReflectionBlocks']) {
    if (existingMessageIds.has(reflection.recordId)) {
      continue;
    }

    await input.conversationStore.appendMessage({
      id: reflection.recordId,
      threadId: input.threadId,
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: reflection.text.trim(),
        },
      ],
      operationalMemoryType: 'reflection',
      operationalMemoryGeneration: reflection['generationCount'],
      createdAt: reflection.createdAt,
    });
  }

  for (const observation of state['observationBlocks']) {
    if (!existingMessageIds.has(observation.id)) {
      await input.conversationStore.appendMessage({
        id: observation.id,
        threadId: input.threadId,
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: observation.text.trim(),
          },
        ],
        operationalMemoryType: 'observation',
        createdAt: observation.createdAt,
      });
    }

    for (const sourceMessageId of observation.sourceMessageIds) {
      await input.conversationStore.updateMessageReplacement({
        threadId: input.threadId,
        messageId: sourceMessageId,
        replacedByMessageId: observation.id,
      });
    }
  }

  for (const observation of state['observationBlocks']) {
    if (observation.reflectedGeneration === null) {
      continue;
    }

    const reflection = state['activeReflectionBlocks'].find(
      (item) => item["generationCount"] === observation.reflectedGeneration,
    );

     
    if (reflection) {
      await input.conversationStore.updateMessageReplacement({
        threadId: input.threadId,
        messageId: observation.id,
        replacedByMessageId: reflection.recordId,
      });
      continue;
    }

    if (
      checkpointSummary !== undefined &&
      checkpointSummary !== null &&
      checkpointSummaryId !== undefined &&
      checkpointSummaryId !== null &&
      observation.reflectedGeneration <= checkpointSummary.upToGeneration
    ) {
      await input.conversationStore.updateMessageReplacement({
        threadId: input.threadId,
        messageId: observation.id,
        replacedByMessageId: checkpointSummaryId,
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (checkpointSummaryId && checkpointSummary) {
    for (const reflection of state['activeReflectionBlocks']) {
      if (reflection['generationCount'] > checkpointSummary.upToGeneration) {
        continue;
      }

      await input.conversationStore.updateMessageReplacement({
        threadId: input.threadId,
        messageId: reflection.recordId,
        replacedByMessageId: checkpointSummaryId,
      });
    }
  }
  try {
    await input.db
      .delete(agentCheckpointedOmStates)
      .where(eq(agentCheckpointedOmStates.agentId, input.agentId));
  } catch (err) {
    forgeDebug({
      scope: 'migrate-legacy-checkpointed-om',
      level: 'info',
      message: 'delete-error',
      context: {
        error: errorMsg(err),
        agentId: input.agentId,
      },
    });
    throw err;
  }
}

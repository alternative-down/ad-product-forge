import { serializeError } from './agent-runner-error-formatting';
import type { ConversationStore } from '@forge-runtime/core';
import { forgeDebug } from '@forge-runtime/core';
import { eq } from 'drizzle-orm';

import type { Database } from '../database/schema';
import { agentCheckpointedOmStates } from '../database/schema';

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

  const state = JSON.parse(legacyRow.state as string) as any;
  const existingMessages = await input.conversationStore.listMessages({
    threadId: input.threadId,
    order: 'asc',
  });
  const existingMessageIds = new Set(existingMessages.map((message: { id: string }) => message.id));
  const checkpointSummary = state['checkpointSummary'];
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
      (item: any) => item['generationCount'] === observation.reflectedGeneration,
    );

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
        error: serializeError(err),
        agentId: input.agentId,
      },
    });
    throw err;
  }
}

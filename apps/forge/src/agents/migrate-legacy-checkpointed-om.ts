import type { ConversationStore } from '@forge-runtime/core';
import { forgeDebug } from '@forge-runtime/core';
import { eq } from 'drizzle-orm';

import type { Database } from '../database';
import { agentCheckpointedOmStates } from '../database/schema';

function extractText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function migrateLegacyCheckpointedOmState(input: {
  db: Database;
  agentId: string;
  threadId: string;
  conversationStore: ConversationStore;
}) {
  const legacyRow = await input.db.query.agentCheckpointedOmStates.findFirst({
    where: eq(agentCheckpointedOmStates.agentId, input.agentId),
  });

  if (!legacyRow) {
    return;
  }

  const state = legacyRow.state;
  const existingMessages = await input.conversationStore.listMessages({
    threadId: input.threadId,
    order: 'asc',
  });
  const existingMessageIds = new Set(existingMessages.map((message: { id: string }) => message.id));
  const checkpointSummary = state.checkpointSummary;
  const checkpointSummaryId = checkpointSummary
    ? `checkpoint-summary:${input.agentId}:${checkpointSummary.upToGeneration}`
    : null;

  if (checkpointSummary && checkpointSummaryId && !existingMessageIds.has(checkpointSummaryId)) {
    await input.conversationStore.appendMessage({
      id: checkpointSummaryId,
      threadId: input.threadId,
      role: 'assistant',
      parts: [{
        type: 'text',
        text: checkpointSummary.text.trim(),
      }],
      operationalMemoryType: 'checkpoint-summary',
      operationalMemoryGeneration: checkpointSummary.upToGeneration,
      createdAt: checkpointSummary.updatedAt,
    });
  }

  for (const reflection of state.activeReflectionBlocks) {
    if (existingMessageIds.has(reflection.recordId)) {
      continue;
    }

    await input.conversationStore.appendMessage({
      id: reflection.recordId,
      threadId: input.threadId,
      role: 'assistant',
      parts: [{
        type: 'text',
        text: reflection.text.trim(),
      }],
      operationalMemoryType: 'reflection',
      operationalMemoryGeneration: reflection.generationCount,
      createdAt: reflection.createdAt,
    });
  }

  for (const observation of state.observationBlocks) {
    if (!existingMessageIds.has(observation.id)) {
      await input.conversationStore.appendMessage({
        id: observation.id,
        threadId: input.threadId,
        role: 'assistant',
        parts: [{
          type: 'text',
          text: observation.text.trim(),
        }],
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

  for (const observation of state.observationBlocks) {
    if (observation.reflectedGeneration === null) {
      continue;
    }

    const reflection = state.activeReflectionBlocks.find((item) => item.generationCount === observation.reflectedGeneration);

    if (reflection) {
      await input.conversationStore.updateMessageReplacement({
        threadId: input.threadId,
        messageId: observation.id,
        replacedByMessageId: reflection.recordId,
      });
      continue;
    }

    if (checkpointSummary && checkpointSummaryId && observation.reflectedGeneration <= checkpointSummary.upToGeneration) {
      await input.conversationStore.updateMessageReplacement({
        threadId: input.threadId,
        messageId: observation.id,
        replacedByMessageId: checkpointSummaryId,
      });
    }
  }

  if (checkpointSummaryId && checkpointSummary) {
    for (const reflection of state.activeReflectionBlocks) {
      if (reflection.generationCount > checkpointSummary.upToGeneration) {
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
    await input.db.delete(agentCheckpointedOmStates).where(eq(agentCheckpointedOmStates.agentId, input.agentId));
  } catch (err) {
    forgeDebug({ scope: 'migrate-legacy-checkpointed-om', level: 'info', message: 'delete-error', context: {
      error: err instanceof Error ? err.message : String(err),
      agentId: input.agentId,
    } });
    forgeDebug({ scope: 'migrate-legacy-checkpointed-om', level: 'error', message: 'migrate-legacy-checkpointed-om: operation failed', error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

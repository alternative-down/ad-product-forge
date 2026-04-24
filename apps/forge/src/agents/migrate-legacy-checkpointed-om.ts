import type { ConversationStore } from '@forge-runtime/core';

import type { Database } from '../database';
import { agentCheckpointedOmStates } from '../database/schema';

function extractText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function renderCheckpointSummaryText(text: string) {
  return ['Checkpoint summary:', text.trim()].join('\n');
}

function renderReflectionText(text: string) {
  return ['Active reflection:', text.trim()].join('\n');
}

function renderObservationText(text: string) {
  return ['Active observation:', text.trim()].join('\n');
}

export async function migrateLegacyCheckpointedOmState(input: {
  db: Database;
  agentId: string;
  threadId: string;
  conversationStore: ConversationStore;
}) {
  const legacyRow = await input.db.query.agentCheckpointedOmStates.findFirst({
    where: (fields, { eq }) => eq(fields.agentId, input.agentId),
  });

  if (!legacyRow) {
    return;
  }

  const state = legacyRow.state;
  const existingMessages = await input.conversationStore.listMessages({
    threadId: input.threadId,
    order: 'asc',
  });
  const existingMessageIds = new Set(existingMessages.map((message) => message.id));
  const checkpointSummary = state.checkpointSummary;
  const checkpointSummaryId = checkpointSummary
    ? `checkpoint-summary:${input.agentId}:${checkpointSummary.upToGeneration}`
    : null;

  if (checkpointSummary && checkpointSummaryId && !existingMessageIds.has(checkpointSummaryId)) {
    await input.conversationStore.appendMessage({
      id: checkpointSummaryId,
      threadId: input.threadId,
      role: 'system',
      parts: [{
        type: 'text',
        text: renderCheckpointSummaryText(checkpointSummary.text),
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
      role: 'system',
      parts: [{
        type: 'text',
        text: renderReflectionText(reflection.text),
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
        role: 'system',
        parts: [{
          type: 'text',
          text: renderObservationText(observation.text),
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

    if (checkpointSummaryId && observation.reflectedGeneration <= checkpointSummary.upToGeneration) {
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

  await input.db.delete(agentCheckpointedOmStates).where((fields, { eq }) => eq(fields.agentId, input.agentId));
}

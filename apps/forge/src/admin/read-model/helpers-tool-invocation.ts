/**
 * Tool invocation helpers for admin/read-model.
 *
 * Extracted from helpers.ts (D49 #6491). Handles merging assistant+tool
 * message pairs, indexing tool results by toolCallId, processing
 * invocations into parts, and collecting unmatched results.
 */
import {
  hasToolCallId,
  hasToolName,
  isNonNullObject,
} from './helpers-type-guards';

export function mergeToolLogMessages<TPart>(
  messages: Array<{
    id: string;
    role: string;
    threadId: string;
    createdAt: string;
    parts: TPart[];
    metadata?: Record<string, unknown>;
  }>,
): Array<{
  id: string;
  role: string;
  threadId: string;
  createdAt: string;
  parts: TPart[];
  metadata?: Record<string, unknown>;
}> {
  const merged: typeof messages = [];

  for (const message of messages) {
    const previousMessage = merged[merged.length - 1];

    if (
      previousMessage?.role === 'assistant' &&
      message.role === 'tool' &&
      Array.isArray(previousMessage.metadata?.toolInvocations) &&
      previousMessage.metadata.toolInvocations.length > 0 &&
      Array.isArray(message.metadata?.toolResults) &&
      message.metadata.toolResults.length > 0
    ) {
      merged[merged.length - 1] = {
        ...previousMessage,
        metadata: {
          ...previousMessage.metadata,
          toolResults: message.metadata.toolResults,
        },
      };
      continue;
    }

    merged.push(message);
  }

  return merged;
}

function indexToolResultsByToolCallId(toolResults: unknown[]) {
  const resultIndexesByToolCallId = new Map<string, number>();
  for (const [index, toolResult] of toolResults.entries()) {
    if (hasToolCallId(toolResult)) {
      resultIndexesByToolCallId.set(toolResult.toolCallId, index);
    }
  }
  return resultIndexesByToolCallId;
}

function processToolInvocations(
  toolInvocations: unknown[],
  resultIndexesByToolCallId: Map<string, number>,
  toolResults: unknown[],
) {
  const parts: Array<Record<string, unknown>> = [];
  const matchedResultIndexes = new Set<number>();

  for (const toolInvocation of toolInvocations) {
    if (!hasToolName(toolInvocation)) {
      continue;
    }

    const toolCallId = hasToolCallId(toolInvocation) ? toolInvocation.toolCallId : null;
    const matchingResultIndex =
      toolCallId !== null ? resultIndexesByToolCallId.get(toolCallId) : undefined;
    const matchingResult =
      matchingResultIndex !== undefined && isNonNullObject(toolResults[matchingResultIndex])
        ? toolResults[matchingResultIndex]
        : null;

    if (matchingResultIndex !== undefined) {
      matchedResultIndexes.add(matchingResultIndex);
    }

    parts.push({
      type: 'tool-invocation',
      toolInvocation: {
        ...toolInvocation,
        ...(matchingResult !== null
          ? {
              result: matchingResult.result,
              state: 'result',
            }
          : {
              state: 'call',
            }),
      },
    });
  }

  return { parts, matchedResultIndexes };
}

function collectUnmatchedResults(toolResults: unknown[], matchedResultIndexes: Set<number>) {
  const parts: Array<Record<string, unknown>> = [];

  for (const [index, toolResult] of toolResults.entries()) {
    if (matchedResultIndexes.has(index) || !isNonNullObject(toolResult)) {
      continue;
    }

    parts.push({
      type: 'tool-result',
      toolResult: {
        toolCallId: toolResult.toolCallId,
        result: toolResult.result,
      },
    });
  }

  return parts;
}

export function buildThreadToolInvocationParts(metadata: Record<string, unknown> | undefined) {
  const toolInvocations = Array.isArray(metadata?.toolInvocations) ? metadata.toolInvocations : [];
  const toolResults = Array.isArray(metadata?.toolResults) ? metadata.toolResults : [];

  const resultIndexesByToolCallId = indexToolResultsByToolCallId(toolResults);
  const { parts: invocationParts, matchedResultIndexes } = processToolInvocations(
    toolInvocations,
    resultIndexesByToolCallId,
    toolResults,
  );
  const unmatchedResultParts = collectUnmatchedResults(toolResults, matchedResultIndexes);

  return [...invocationParts, ...unmatchedResultParts];
}

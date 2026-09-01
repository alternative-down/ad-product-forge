export type RuntimeStoredMessagePart = {
  type: string;
  text?: string;
  [key: string]: unknown;
};

export type ToolLogMessage = {
  id: string;
  role: string;
  threadId: string;
  createdAt: string;
  parts: RuntimeStoredMessagePart[];
  metadata?: Record<string, unknown>;
};

/**
 * Merges consecutive assistant/tool message pairs in a thread log.
 *
 * When an 'assistant' message with tool invocations is immediately followed
 * by a 'tool' message with tool results, the tool results are attached to the
 * assistant message and the tool message is skipped.
 *
 * This produces a flat list where each assistant message that had tool calls
 * already carries the corresponding results.
 *
 * Pure function — no I/O, no side effects.
 */
export function mergeToolLogMessages(messages: ToolLogMessage[]): ToolLogMessage[] {
  const merged: ToolLogMessage[] = [];

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


/**
 * Builds a flat list of tool-call and tool-result parts from message metadata.
 *
 * - Each tool invocation becomes a `{ type: 'tool-call', toolCallId, toolName,
 *   args, result? }` part. The result is attached if a matching toolResult
 *   is found by toolCallId.
 * - Tool results with no matching invocation are appended as `{ type: 'tool-result' }`.
 *
 * Ordering: invocations first (preserving order), unmatched results appended.
 *
 * Pure function — no I/O, no side effects.
 */
type ToolInvocation = {
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  [key: string]: unknown;
};

type ToolResult = {
  toolCallId?: string;
  result?: unknown;
  [key: string]: unknown;
};

export function buildThreadToolInvocationParts(
  metadata: Record<string, unknown> | undefined,
): Array<Record<string, unknown>> {
  const toolInvocations = Array.isArray(metadata?.toolInvocations)
    ? (metadata.toolInvocations as ToolInvocation[])
    : [];
  const toolResults = Array.isArray(metadata?.toolResults)
    ? (metadata.toolResults as ToolResult[])
    : [];

  const resultIndexesByToolCallId = new Map<string, number>();
  for (const [index, toolResult] of toolResults.entries()) {
    if (
      typeof toolResult !== 'object' ||
      toolResult === null ||
      typeof toolResult.toolCallId !== 'string'
    ) {
      continue;
    }

    resultIndexesByToolCallId.set(toolResult.toolCallId, index);
  }

  const parts: Array<Record<string, unknown>> = [];
  const matchedResultIndexes = new Set<number>();

  for (const toolInvocation of toolInvocations) {
    if (
      typeof toolInvocation !== 'object' ||
      toolInvocation === null ||
      typeof toolInvocation.toolName !== 'string'
    ) {
      continue;
    }

    const toolCallId =
      typeof toolInvocation.toolCallId === 'string' ? toolInvocation.toolCallId : null;
    const toolResultIndex =
      toolCallId !== null && toolCallId !== undefined
        ? resultIndexesByToolCallId.get(toolCallId)
        : undefined;
    const toolResult = typeof toolResultIndex === 'number' ? toolResults[toolResultIndex] : null;

    if (typeof toolResultIndex === 'number') {
      matchedResultIndexes.add(toolResultIndex);
    }

    parts.push({
      type: 'tool-call',
      toolCallId,
      toolName: toolInvocation.toolName,
      args: toolInvocation.args,
      ...(toolResult ? { result: toolResult } : {}),
    });
  }

  for (const [index, toolResult] of toolResults.entries()) {
    if (matchedResultIndexes.has(index)) {
      continue;
    }

    parts.push({
      type: 'tool-result',
      ...(typeof toolResult === 'object' && toolResult !== null
        ? (toolResult as Record<string, unknown>)
        : { result: toolResult }),
    });
  }

  return parts;
}

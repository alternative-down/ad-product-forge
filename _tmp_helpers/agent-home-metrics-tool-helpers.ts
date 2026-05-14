// Types and pure functions for tool invocation message merging.

export type ToolInvocation = {
  toolName: string;
  toolCallId?: string;
  args?: unknown;
  result?: unknown;
};

export type ToolResult = {
  toolCallId: string;
  result?: unknown;
};

export type RuntimeStoredMessagePart = {
  type: 'tool-call' | 'tool-result' | 'text' | 'reasoning' | string;
  toolName?: string;
  toolCallId?: string;
  args?: unknown;
  result?: unknown;
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
 * Merges consecutive assistant+tool pairs by attaching toolResults to assistant
 * metadata, then appending any unmatched tool-results as own messages.
 *
 * Algorithm:
 * - Iterates messages left-to-right, maintaining a "previous" merged message.
 * - If previous has toolInvocations metadata AND current has toolResults:
 *   REPLACE metadata.toolResults with current's toolResults (only one result at a time).
 *   previous.message.role stays 'assistant'.
 * - Else: push previous to output, set current as new previous.
 *
 * REPLACE semantics: multiple consecutive tool messages will overwrite
 * toolResults each time. Use case is single result per invocation.
 *
 * Pure function — no I/O, no side effects.
 */
export function mergeToolLogMessages(
  messages: ToolLogMessage[],
): ToolLogMessage[] {
  if (!messages?.length) {
    return [];
  }

  const output: ToolLogMessage[] = [];
  let previousMessage: ToolLogMessage | null = null;

  for (const message of messages) {
    if (previousMessage === null) {
      previousMessage = message;
      continue;
    }

    const prevMeta = previousMessage.metadata;
    const currMeta = message.metadata;
    const prevToolInvocations = prevMeta?.toolInvocations as ToolInvocation[] | undefined;
    const currToolResults = currMeta?.toolResults as ToolResult[] | undefined;

    const shouldMerge =
      prevToolInvocations?.length &&
      currToolResults?.length &&
      previousMessage.role !== 'tool';

    if (shouldMerge) {
      previousMessage = {
        ...previousMessage,
        metadata: {
          ...prevMeta,
          toolResults: currToolResults,
        },
      };
    } else {
      output.push(previousMessage);
      previousMessage = message;
    }
  }

  if (previousMessage !== null) {
    output.push(previousMessage);
  }

  return output;
}

/**
 * Builds a flat array of tool-call and tool-result parts from message metadata.
 *
 * For each toolInvocation in metadata:
 *   - Creates a { type: 'tool-call', toolName, toolCallId, args, result } part.
 *   - Args are copied from the invocation (if present and is an object).
 *   - Result is the FULL toolResult object matched by toolCallId (if found).
 *   - Skips entries where toolInvocation is not a plain object or toolName is not a string.
 *
 * For any toolResults that do not match an invocation's toolCallId:
 *   - Appended as standalone { type: 'tool-result', toolCallId, result } parts.
 *   - Result is the toolResult's result field.
 *
 * Pure function — no I/O, no side effects.
 */
export function buildThreadToolInvocationParts(
  metadata: Record<string, unknown> | undefined,
): RuntimeStoredMessagePart[] {
  if (!metadata) {
    return [];
  }

  const toolInvocations = Array.isArray(metadata?.toolInvocations)
    ? metadata.toolInvocations
    : [];
  const toolResults = Array.isArray(metadata?.toolResults)
    ? metadata.toolResults
    : [];
  const resultIndexesByToolCallId = new Map<string, number>();
  const parts: RuntimeStoredMessagePart[] = [];
  const matchedResultIndexes = new Set<number>();

  for (const [index, toolResult] of toolResults.entries()) {
    if (
      typeof toolResult !== 'object'
      || toolResult === null
      || typeof toolResult.toolCallId !== 'string'
    ) {
      continue;
    }

    resultIndexesByToolCallId.set(toolResult.toolCallId, index);
  }

  for (const toolInvocation of toolInvocations) {
    if (
      typeof toolInvocation !== 'object'
      || toolInvocation === null
      || typeof toolInvocation.toolName !== 'string'
    ) {
      continue;
    }

    const toolCallId = typeof toolInvocation.toolCallId === 'string'
      ? toolInvocation.toolCallId
      : null;
    const toolResultIndex = toolCallId ? resultIndexesByToolCallId.get(toolCallId) : undefined;
    const toolResult = typeof toolResultIndex === 'number'
      ? toolResults[toolResultIndex]
      : null;

    if (typeof toolResultIndex === 'number') {
      matchedResultIndexes.add(toolResultIndex);
    }

    const part: RuntimeStoredMessagePart = {
      type: 'tool-call',
      toolCallId,
      toolName: toolInvocation.toolName,
    };

    // Copy args from toolInvocation if present and is a plain object
    if (toolInvocation.args && typeof toolInvocation.args === 'object' && !Array.isArray(toolInvocation.args)) {
      part.args = toolInvocation.args;
    }

    // Attach the FULL toolResult object as result if found
    if (toolResult) {
      part.result = toolResult;
    }

    parts.push(part);
  }

  for (const [index, toolResult] of toolResults.entries()) {
    if (matchedResultIndexes.has(index)) {
      continue;
    }

    if (
      typeof toolResult !== 'object'
      || toolResult === null
      || typeof toolResult.toolCallId !== 'string'
    ) {
      continue;
    }

    parts.push({
      type: 'tool-result',
      toolCallId: toolResult.toolCallId,
      result: toolResult.result,
    });
  }

  return parts;
}
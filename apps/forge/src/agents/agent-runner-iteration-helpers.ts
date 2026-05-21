/**
 * agent-runner-iteration-helpers.ts
 *
 * Extracts iteration-processing utilities from agent-runner-helpers.ts.
 *
 * Functions for transforming LLM iterations for the LTM recall pipeline:
 * building stable loop signatures, constructing recall steps, detecting
 * visible assistant text output, and identifying working-memory updates.
 *
 * No external dependencies — fully testable in isolation.
 */
import { collectStepTextParts } from './agent-runner-control-directives';

export { collectStepTextParts };

// ─── Loop signature ────────────────────────────────────────────────────────────

/**
 * Builds a stable JSON signature for the loop detector from an iteration.
 * Only includes text (trimmed) and normalized tool call shapes.
 * Used by the loop detector to detect repeated agent behaviour.
 */
export function buildIterationLoopSignature(iteration: {
  text: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
}): string {
  return JSON.stringify({
    text: iteration.text.trim(),
    toolCalls: iteration.toolCalls.map((toolCall) => ({
      toolName: toolCall.name,
      args: toolCall.args,
    })),
  });
}

// ─── LTM recall step builder ─────────────────────────────────────────────────

/**
 * Converts an LLM iteration into the structured recall step format
 * expected by the long-term-memory store.
 * Normalises toolCall/toolResult shapes to match the LTM schema.
 */
export function buildRecallStepFromIteration(iteration: {
  text: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
  toolResults: Array<{
    name: string;
    result: unknown;
  }>;
}): {
  text: string;
  toolCalls: Array<{
    toolName: string;
    args: Record<string, unknown>;
  }>;
  toolResults: Array<{
    toolName: string;
    result: unknown;
  }>;
} {
  return {
    text: iteration.text,
    toolCalls: iteration.toolCalls.map((toolCall) => ({
      toolName: toolCall.name,
      args: toolCall.args,
    })),
    toolResults: iteration.toolResults.map((toolResult) => ({
      toolName: toolResult.name,
      result: toolResult.result,
    })),
  };
}

// ─── Visible text detection ──────────────────────────────────────────────────

/**
 * Returns true if the iteration produced visible assistant text output.
 * Checks the top-level text field and the content of assistant messages
 * in the messages array (handles both string and array content).
 */
export function didIterationProduceVisibleAssistantText(iteration: {
  text: string;
  messages: unknown[];
}): boolean {
  if (iteration.text.length > 0) {
    return true;
  }

  for (const message of iteration.messages) {
    if (message === null || message === undefined || typeof message !== 'object') {
      continue;
    }

    const msg = message as Record<string, unknown>;
    if (!('role' in msg) || msg.role !== 'assistant') {
      continue;
    }

    if (!('content' in msg)) {
      continue;
    }

    const content = msg.content;
    if (typeof content === 'string') {
      if ((content as string).trim()) {
        return true;
      }
      continue;
    }

    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (part === null || part === undefined || typeof part !== 'object') {
        continue;
      }

      const partObj = part as Record<string, unknown>;
      if (
        'type' in partObj &&
        partObj.type === 'text' &&
        'text' in partObj &&
        typeof partObj.text === 'string' &&
        partObj.text.trim()
      ) {
        return true;
      }
    }
  }

  return false;
}

// ─── Working-memory update detection ─────────────────────────────────────────

/**
 * Returns true if the iteration contains an updateWorkingMemory tool call.
 */
export function didIterationUpdateWorkingMemory(iteration: {
  toolCalls: Array<{ name: string }>;
}): boolean {
  return iteration.toolCalls.some((tool) => tool.name === 'updateWorkingMemory');
}

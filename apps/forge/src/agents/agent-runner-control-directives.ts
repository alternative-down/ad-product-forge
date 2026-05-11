/**
 * agent-runner-control-directives.ts
 *
 * Extracts control-directive parsing utilities from agent-runner-helpers.ts.
 *
 * Functions for detecting STOP_AND_IDLE and NO_ACTION_NEEDED directives
 * in LLM text output, and for building the agent system prompt.
 *
 * No external dependencies — fully testable in isolation.
 */

const NO_ACTION_NEEDED_PREFIX = 'NO_ACTION_NEEDED';
const STOP_AND_IDLE_PREFIX = 'STOP_AND_IDLE';

// ─── Core directive detection ──────────────────────────────────────────────────

/**
 * Returns true if any line of the given text includes the directive prefix.
 * Used by extractRunnerControlDirective to scan both the top-level text
 * and any text parts collected from step uiMessages.
 */
export function hasExactControlDirective(text: string, directive: string): boolean {
  return text
    .split('\n')
    .map((line) => line.trim())
    .some((line) => line.includes(directive));
}

// ─── Result-level directive extraction ────────────────────────────────────────

type GenerateResult = {
  text: string;
  steps?: Array<{
    response?: {
      uiMessages?: Array<{
        parts?: Array<unknown>;
      }>;
    };
  }>;
};

/**
 * Collects all text content from step uiMessages parts.
 * Used to augment control directive detection with text from streaming steps.
 */
export function collectStepTextParts(steps: Array<{
  response?: {
    uiMessages?: Array<{
      parts?: Array<unknown>;
    }>;
  };
}>): string[] {
  const texts: string[] = [];
  for (const step of steps) {
    for (const message of step.response?.uiMessages ?? []) {
      for (const part of message.parts ?? []) {
        if (part === null || part === undefined || typeof part !== 'object') {
          continue;
        }

        const partObj = part as Record<string, unknown>;
        if ('type' in partObj && partObj.type === 'text' && 'text' in partObj && typeof partObj.text === 'string') {
          texts.push(partObj.text as string);
        }
      }
    }
  }

  return texts;
}

/**
 * Returns the control directive ('stop' | 'ignore' | null) for a generate result.
 *
 * Scans both the result text and any text parts from step uiMessages.
 * - STOP_AND_IDLE → 'stop'
 * - NO_ACTION_NEEDED → 'ignore'
 * - Otherwise → null
 */
export function extractRunnerControlDirective(result: GenerateResult): 'stop' | 'ignore' | null {
  const texts = [
    result.text,
    ...collectStepTextParts(result.steps ?? []),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  if (texts.some((value) => hasExactControlDirective(value, STOP_AND_IDLE_PREFIX))) {
    return 'stop' as const;
  }
  if (texts.some((value) => hasExactControlDirective(value, NO_ACTION_NEEDED_PREFIX))) {
    return 'ignore' as const;
  }

  return null;
}

// ─── System prompt builder ────────────────────────────────────────────────────

/**
 * Builds the system prompt text from agent context instructions.
 * Returns null if no instructions are provided.
 */
export function buildStepSystemPrompt(input: {
  agentContextInstructions: string | null | undefined;
}): string | null {
  const sections = [
    input.agentContextInstructions?.trim() ?? null,
  ].filter((value): value is string => Boolean(value));

  if (sections.length === 0) {
    return null;
  }

  return sections.join('\n\n');
}

// ─── Constants (re-exported for consumers) ───────────────────────────────────

export { NO_ACTION_NEEDED_PREFIX, STOP_AND_IDLE_PREFIX };
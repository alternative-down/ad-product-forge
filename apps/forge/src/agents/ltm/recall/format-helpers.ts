/**
 * Stateless formatting helpers for the LTM recall pipeline.
 *
 * Extracted from `recall.ts` to reduce monolith size. All functions are pure:
 * they only depend on their inputs and contain no references to instance state.
 */

/**
 * Recursively format an arbitrary value as a human-readable indented string.
 * Strings, numbers, and booleans are returned directly. Arrays render as
 * bullet lists. Objects render as `key:` lines, with nested values indented.
 */
export function formatStructuredValue(value: unknown, indentLevel = 0): string {
  const indent = '  '.repeat(indentLevel);

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '';
    }

    return value
      .map((item) => formatStructuredValue(item, indentLevel + 1))
      .filter(Boolean)
      .map((item) => `${indent}- ${item.replace(/\n/g, `\n${indent}  `)}`)
      .join('\n');
  }

  if (value === null || value === undefined || typeof value !== 'object') {
    return '';
  }

  return Object.entries(value)
    .map(([key, item]) => {
      const formatted = formatStructuredValue(item, indentLevel + 1);

      if (!formatted) {
        return '';
      }

      if (!formatted.includes('\n')) {
        return `${indent}${key}: ${formatted}`;
      }

      return `${indent}${key}:\n${formatted}`;
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Extract the `relevantContext` field from a graph search result.
 * Accepts string or string[]; returns null for anything else.
 */
export function readGraphRelevantContext(result: unknown): string | null {
  if (result === null || result === undefined || typeof result !== 'object') {
    return null;
  }

  const relevantContext = (result as Record<string, unknown>).relevantContext;

  if (typeof relevantContext === 'string') {
    return relevantContext;
  }

  if (Array.isArray(relevantContext)) {
    return relevantContext
      .map((value) => (typeof value === 'string' ? value : ''))
      .filter(Boolean)
      .join('\n\n');
  }

  return null;
}

/**
 * Extract the `sources` array from a graph search result.
 * Returns an empty array if the field is missing or not an array.
 */
export function readGraphSources(result: unknown): unknown[] {
  if (result === null || result === undefined || typeof result !== 'object') {
    return [];
  }

  const sources = (result as Record<string, unknown>).sources;
  return Array.isArray(sources) ? sources : [];
}

/**
 * Extract the trimmed `document` string from a graph source entry.
 * Returns an empty string when missing or non-string.
 */
export function readGraphSourceDocument(source: unknown): string {
  if (source === null || source === undefined || typeof source !== 'object') {
    return '';
  }

  const document = (source as Record<string, unknown>).document;
  return typeof document === 'string' ? document.trim() : '';
}

/**
 * Build a recall query string from an LTM step record.
 * Combines `text`, `reasoningText`, `toolCalls` (using `args` or `input`),
 * and `toolResults` (using `result` or `output`) into a single trimmed string.
 */
export function buildRecallQueryFromStep(step: unknown): string {
  if (step === null || step === undefined || typeof step !== 'object') {
    return '';
  }

  const record = step as Record<string, unknown>;
  const toolCalls = Array.isArray(record.toolCalls) ? record.toolCalls : [];
  const toolResults = Array.isArray(record.toolResults) ? record.toolResults : [];

  return [
    typeof record.text === 'string' ? record.text : '',
    typeof record.reasoningText === 'string' ? record.reasoningText : '',
    toolCalls
      .map((toolCall) => {
        if (toolCall === null || toolCall === undefined || typeof toolCall !== 'object') {
          return '';
        }

        const recordToolCall = toolCall as Record<string, unknown>;
        const toolName =
          typeof recordToolCall.toolName === 'string' ? recordToolCall.toolName : 'unknown';
        const formatted = formatStructuredValue(
          recordToolCall.args ?? recordToolCall.input ?? null,
        );

        if (!formatted) {
          return '';
        }

        return [`Tool call: ${toolName}`, formatted].join('\n');
      })
      .filter(Boolean)
      .join('\n\n'),
    toolResults
      .map((toolResult) => {
        if (toolResult === null || toolResult === undefined || typeof toolResult !== 'object') {
          return '';
        }

        const recordToolResult = toolResult as Record<string, unknown>;
        const toolName =
          typeof recordToolResult.toolName === 'string'
            ? recordToolResult.toolName
            : 'unknown';
        const formatted = formatStructuredValue(
          recordToolResult.result ?? recordToolResult.output ?? null,
        );

        if (!formatted) {
          return '';
        }

        return [`Tool result: ${toolName}`, formatted].join('\n');
      })
      .filter(Boolean)
      .join('\n\n'),
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
}

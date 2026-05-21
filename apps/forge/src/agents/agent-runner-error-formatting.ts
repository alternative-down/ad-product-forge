/**
 * agent-runner-error-formatting.ts
 *
 * Extracts error-serialization utilities from agent-runner-helpers.ts.
 *
 * Functions for converting errors and unknown values into structured,
 * human-readable formats suitable for storage and debugging.
 *
 * No external dependencies — fully testable in isolation.
 */
import { withTimeout } from '../utils/async';
import { RUNNER_AWAIT_TIMEOUT_MS } from './agent-runner-generate';

// ─── Core serialization ────────────────────────────────────────────────────────

/**
 * Recursively serializes an unknown value into a JSON-safe structure.
 * - Error instances → serializeError()
 * - Arrays → mapped recursively
 * - Primitives → returned as-is
 * - Objects → key-value entries, values serialized recursively
 */
export function serializeUnknown(value: unknown): unknown {
  if (value instanceof Error) {
    return serializeError(value);
  }
  if (Array.isArray(value)) {
    return value.map(serializeUnknown);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, serializeUnknown(item)]),
  );
}

/**
 * Converts an Error (or any unknown value) into a structured Record.
 * - Error: { name, message, stack, ...extra }
 * - Other: { type, value }
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return {
      type: typeof error,
      value: error,
    };
  }
  const extra = Object.fromEntries(
    Object.keys(error as unknown as Record<string, unknown>)
      .filter((key) => !['name', 'message', 'stack'].includes(key))
      .map((key) => [key, serializeUnknown((error as unknown as Record<string, unknown>)[key])]),
  );

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...extra,
  };
}

// ─── Absent-execution error formatting ────────────────────────────────────────

/**
 * Formats a single error-detail value into a human-readable string.
 * - null/undefined → null
 * - string → truncated to 200 chars if needed
 * - number/boolean → String()
 * - other → JSON.stringify
 */
export function formatAbsentErrorDetailValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value.length > 200 ? `${value.substring(0, 200)}...` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}

/**
 * Extracts structured detail lines from an Error for absent-execution messages.
 * Checks for: code, statusCode, statusText, url, responseBody, body, data, detail
 */
export function extractAbsentErrorDetails(error: Error): string[] {
  const details: string[] = [];
  const e = error as unknown as Record<string, unknown>;

  if ('code' in e && typeof e.code === 'string') {
    details.push(`Error code: ${e.code}`);
  }

  if ('statusCode' in e && typeof e.statusCode === 'number') {
    details.push(`statusCode: ${e.statusCode}`);
  }

  if ('statusText' in e && typeof e.statusText === 'string') {
    details.push(`statusText: ${e.statusText}`);
  }

  if ('url' in e && typeof e.url === 'string') {
    details.push(`url: ${e.url}`);
  }

  const responseBody = formatAbsentErrorDetailValue(e.responseBody);
  if (responseBody !== null) {
    details.push(`responseBody: ${responseBody}`);
  }

  const body = formatAbsentErrorDetailValue(e.body);
  if (body !== null) {
    details.push(`body: ${body}`);
  }

  const data = formatAbsentErrorDetailValue(e.data);
  if (data !== null) {
    details.push(`data: ${data}`);
  }

  const detail = formatAbsentErrorDetailValue(e.detail);
  if (detail !== null) {
    details.push(`Detail: ${detail}`);
  }

  return details;
}

export interface AbsentExecutionErrorInput {
  stage: string | null;
  lastGenerateProgress?: {
    stage: string;
    at: number;
    detail: Record<string, unknown> | null;
  } | null;
  error: unknown;
}

/**
 * Formats a structured absent-execution error message from inputs.
 * Returns a human-readable multi-line string suitable for agent storage.
 *
 * - Error instances: includes name, message, progress, and extracted details
 * - Non-errors: includes stage, stringified value, and progress
 */
export function formatAbsentExecutionError(
  input: AbsentExecutionErrorInput,
  extractAbsentErrorDetailsFn: typeof extractAbsentErrorDetails = extractAbsentErrorDetails,
): string {
  const stage = input.stage ?? 'unknown';
  const progressLines = input.lastGenerateProgress
    ? [
        `Last progress stage: ${input.lastGenerateProgress.stage}`,
        `Last progress at: ${new Date(input.lastGenerateProgress.at).toISOString()}`,
        ...(input.lastGenerateProgress.detail
          ? [`Last progress detail: ${JSON.stringify(input.lastGenerateProgress.detail)}`]
          : []),
      ]
    : [];

  if (input.error instanceof Error) {
    const details = extractAbsentErrorDetailsFn(input.error);

    return [
      `Stage: ${stage}`,
      `${input.error.name}: ${input.error.message}`,
      ...progressLines,
      ...details,
    ].join('\n');
  }

  return [`Stage: ${stage}`, String(input.error), ...progressLines].join('\n');
}

/**
 * Wrapped version that applies withTimeout to store.setExecutionAbsent.
 * Exported separately so callers needing the timeout behavior can use it directly.
 */
export async function setExecutionAbsentWithTimeout(params: {
  runtimeId: string;
  store: {
    setExecutionAbsent: (id: string, message: string) => Promise<void>;
  };
  formatAbsentExecutionErrorFn: typeof formatAbsentExecutionError;
  input: AbsentExecutionErrorInput;
}): Promise<void> {
  const { runtimeId, store, formatAbsentExecutionErrorFn, input } = params;
  const message = formatAbsentExecutionErrorFn(input);
  await withTimeout(
    store.setExecutionAbsent(runtimeId, message),
    RUNNER_AWAIT_TIMEOUT_MS,
    `Agent execution state update timed out for ${runtimeId}`,
  );
}

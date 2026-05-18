/**
 * Converts an unknown error value to a human-readable string.
 * Used consistently across all github/ops modules for forgeDebug context.
 */
export function serializeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

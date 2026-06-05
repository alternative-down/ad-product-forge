import { forgeDebug } from '@forge-runtime/core';

/**
 * Parses a date string used for filtering operations.
 *
 * Returns `null` for `undefined`, `null`, or empty string (interpreted as
 * "no filter"). Throws for any other non-parseable value.
 *
 * The `fieldName` is included in the error message and in the forgeDebug
 * context to help diagnose which filter field was invalid.
 */
export function parseFilterDate(
  value: string | undefined,
  fieldName: string
): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    forgeDebug({
      scope: 'filter-helpers',
      level: 'warn',
      message: 'parseFilterDate: invalid value',
      context: { fieldName, value },
    });
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
  return parsed;
}

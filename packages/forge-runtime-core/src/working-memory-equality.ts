import { WORKING_MEMORY_SCHEMA } from './working-memory.js';
import type { z } from 'zod';

type WorkingMemoryData = NonNullable<z.infer<typeof WORKING_MEMORY_SCHEMA>>;

/**
 * Property-by-property deep equality for WORKING_MEMORY_SCHEMA objects.
 *
 * Why not JSON.stringify?
 * - JSON.stringify produces inconsistent key ordering across runs,
 *   so identical objects serialize to different strings → false positive writes.
 * - JSON.stringify drops `undefined` values, so setting a field to `undefined`
 *   silently matches the old serialized form → silent skipped writes.
 * - Property-by-property comparison avoids both failure modes.
 */
export function isWorkingMemoryEqual(
  a: WorkingMemoryData,
  b: WorkingMemoryData,
): boolean {
  return compareObjects(a, b);
}

function compareObjects(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) {
      return false;
    }

    const valA = (a as Record<string, unknown>)[key];
    const valB = (b as Record<string, unknown>)[key];

    if (typeof valA === 'string' && typeof valB === 'string') {
      // Direct string comparison avoids JSON.stringify ordering noise
      if (valA !== valB) return false;
    } else if (!compareObjects(valA, valB)) {
      return false;
    }
  }

  return true;
}
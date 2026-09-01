import type { z } from 'zod';

// Type-only import — erased at compile time, no runtime circular dependency.
import type { WORKING_MEMORY_SCHEMA } from './working-memory.js';

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
 *
 * `WORKING_MEMORY_SCHEMA` is used for type inference only (import type).
 * At runtime the function operates on plain objects.
 */
export function isWorkingMemoryEqual(a: WorkingMemoryData, b: WorkingMemoryData): boolean {
  return compareObjects(a, b);
}

// Inline the WORKING_MEMORY_SCHEMA shape to avoid circular import.
// The shape is: { identity?, domain?, direction? } where each nested object
// has string-valued leaves. Using Record<string, unknown> is sufficient for
// structural comparison at runtime.
function schemaShapeMatch(a: unknown, b: unknown): boolean {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return a === b;
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
    if (!compareObjects(valA, valB)) {
      return false;
    }
  }

  return true;
}

function compareObjects(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }

  const valA = a as Record<string, unknown>;
  const valB = b as Record<string, unknown>;

  const keysA = Object.keys(valA);
  const keysB = Object.keys(valB);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(valB, key)) {
      return false;
    }
    const childA = valA[key];
    const childB = valB[key];

    if (typeof childA === 'string' && typeof childB === 'string') {
      if (childA !== childB) return false;
    } else if (!schemaShapeMatch(childA, childB)) {
      return false;
    }
  }

  return true;
}

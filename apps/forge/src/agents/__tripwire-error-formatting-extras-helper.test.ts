// Tripwire: enforce that `as unknown as Record<string, unknown>` casts in
// apps/forge/src/agents/error-formatting.ts are CONFINED to the
// `getErrorExtras` helper (#6021 P3, L#NN-32 v8 cluster).
//
// Before #6021: 3 cast sites scattered across serializeError (L50, L52) and
// extractAbsentErrorDetails (L101). Each one re-introduced the type-lie.
//
// After #6021: 1 cast site, in the `getErrorExtras` helper itself, with full
// documentation of why the lie is necessary. All other sites use the helper.
//
// This tripwire enforces the cluster invariant: the only `as unknown as
// Record<string, unknown>` cast in the CODE (not in JSDoc/comments) must be
// inside `getErrorExtras`.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = resolve(__dirname, 'error-formatting.ts');

/**
 * Strip JSDoc (`/** ... *\/`) and line comments (`// ...`) from source.
 * Used to avoid false positives where the cast pattern is mentioned in a
 * comment string (e.g. helper documentation).
 */
function stripComments(src: string): string {
  // Remove block comments (greedy across newlines)
  let s = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove line comments
  s = s.replace(/\/\/[^\n]*/g, '');
  return s;
}

describe('L#NN-32 v8 tripwire: error-formatting.ts casts are confined to getErrorExtras (#6021)', () => {
  const rawSource = readFileSync(FILE_PATH, 'utf8');
  const source = stripComments(rawSource);

  it('the helper `getErrorExtras` exists and returns Record<string, unknown>', () => {
    expect(source).toMatch(/function\s+getErrorExtras\s*\(\s*error:\s*Error\s*\)\s*:\s*Record<string,\s*unknown>/);
  });

  it('exactly one cast exists in the code (the one inside getErrorExtras)', () => {
    const castCount = (source.match(/as unknown as Record<string, unknown>/g) || []).length;
    expect(castCount, `Expected 1 cast in code (inside helper); found ${castCount}`).toBe(1);
  });

  it('the cast is inside the helper body', () => {
    // Locate the helper body: from `function getErrorExtras(` until the matching `}`
    // Use a simple brace-counter to handle the body correctly.
    const start = source.indexOf('function getErrorExtras(');
    expect(start, 'helper function must exist').toBeGreaterThanOrEqual(0);
    let depth = 0;
    let i = source.indexOf('{', start);
    expect(i).toBeGreaterThan(start);
    let bodyEnd = -1;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) { bodyEnd = i; break; }
      }
    }
    expect(bodyEnd).toBeGreaterThan(start);
    const helperBody = source.slice(start, bodyEnd + 1);
    expect(helperBody).toMatch(/as unknown as Record<string, unknown>/);
  });
});
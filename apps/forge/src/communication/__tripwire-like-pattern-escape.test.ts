// Tripwire: enforce that all `like(...)` calls in internal-chat-messages.ts
// pass through `escapeLikePattern` to prevent SQL LIKE-wildcard filter bypass
// (L#NN-50 #19 v3, #6037 P2).
//
// Background: prior to #6037, the file had 2 sites using `%${input.query}%`
// directly. This allowed attackers to:
//   - Pass `%` to bypass content filtering entirely
//   - Pass `_` to widen matching to single chars
//   - Enumerate via partial-match (e.g., `password%`)
//
// This tripwire asserts:
// 1. Every `like(...)` call uses `escapeLikePattern(input.query)` (NOT raw input.query)
// 2. No raw `%${input.query}%` or `%${...}%` patterns remain

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = resolve(__dirname, 'internal-chat-messages.ts');

describe('L#NN-50 #19 v3 tripwire: internal-chat-messages.ts LIKE patterns are escaped (#6037)', () => {
  const source = readFileSync(FILE_PATH, 'utf8');

  it('has an escapeLikePattern helper defined', () => {
    expect(source).toMatch(/function escapeLikePattern\(/);
    expect(source).toMatch(/escapeLikePattern\(input\.query\)/);
  });

  it('has no raw `%${...query...}%` LIKE patterns (without escapeLikePattern)', () => {
    // Pattern: `%${<something>}%` where <something> is not escapeLikePattern(...)
    const rawLikeRegex = /like\([^)]*?`%\$\{[^}]*\}%`/g;
    const matches = source.match(rawLikeRegex) || [];
    // Filter out patterns that DO use escapeLikePattern
    const unsafe = matches.filter((m) => !m.includes('escapeLikePattern'));
    expect(unsafe, `Found unsafe LIKE patterns: ${unsafe.join(', ')}`).toEqual([]);
  });

  it('uses escapeLikePattern in both getMessages and getMessagesByAccount', () => {
    // Count usages of escapeLikePattern — should be 1 definition + 2 call sites
    const usages = (source.match(/escapeLikePattern\(/g) || []).length;
    expect(usages, 'Expected 3 (1 def + 2 calls)').toBe(3);
  });
});
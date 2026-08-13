/**
 * Tripwire (regression for cycle 24 — conversationHelpersDebug extraction):
 * all forgeDebug calls in admin/read-model/conversation-helpers.ts must go
 * through the centralized conversationHelpersDebug helper, not as direct
 * calls. Direct calls defeat the purpose of the helper (centralized
 * scope/level management, baked scope='admin-read-model-conversation-helpers',
 * L#NN-50 #50 context spread) and signal a drift back to the pre-cycle-24
 * copy-paste pattern.
 *
 * Allow-list:
 *   - Lines annotated with the comment marker // INTENTIONAL DIRECT LOG are
 *     exempt (consistent with L#NN-13 13a tripwire convention).
 *
 * This is a static (regex over source) check so it catches regressions even
 * when the affected code paths are not exercised at runtime.
 *
 * L#NN-HELPER-EXTRACTION-TRIPWIRE-PATTERN v1 N=4 (codified): every helper
 * extraction MUST add a corresponding __no-direct-*-forgeDebug tripwire.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const HELPERS_TS = join(__dirname, 'conversation-helpers.ts');

describe('L#NN-50 tripwire — admin/read-model/conversation-helpers.ts forgeDebug hygiene (cycle 24)', () => {
  it('conversation-helpers.ts has 0 direct forgeDebug(...) calls (must use conversationHelpersDebug helper)', () => {
    const src = readFileSync(HELPERS_TS, 'utf8');
    // Strip INTENTIONAL DIRECT LOG lines per L#NN-13 13a convention.
    const cleaned = src
      .split('\n')
      .filter((line) => !line.includes('INTENTIONAL DIRECT LOG'))
      .join('\n');
    // Count `forgeDebug(` occurrences as direct calls (not `conversationHelpersDebug(`).
    const matches = cleaned.match(/\bforgeDebug\s*\(/g);
    const count = matches ? matches.length : 0;
    expect(count).toBe(0);
  });

  it('conversation-helpers.ts uses conversationHelpersDebug at all 4 legacy call sites (sanity)', () => {
    const src = readFileSync(HELPERS_TS, 'utf8');
    const matches = src.match(/conversationHelpersDebug\s*\(/g);
    expect(matches ? matches.length : 0).toBeGreaterThanOrEqual(4);
  });
});

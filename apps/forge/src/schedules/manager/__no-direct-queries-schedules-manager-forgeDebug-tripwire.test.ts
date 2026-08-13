/**
 * Tripwire (regression for cycle 23 — queriesSchedulesManagerDebug extraction):
 * all forgeDebug calls in schedules/manager/queries.ts must go through the
 * centralized queriesSchedulesManagerDebug helper, not as direct calls.
 *
 * Direct calls defeat the purpose of the helper (centralized scope/level
 * management, baked scope='schedules-manager', L#NN-50 #50 context spread)
 * and signal a drift back to the pre-cycle-23 copy-paste pattern.
 *
 * Allow-list:
 *   - Lines annotated with the comment marker // INTENTIONAL DIRECT LOG are
 *     exempt (consistent with L#NN-13 13a tripwire convention).
 *
 * This is a static (regex over source) check so it catches regressions even
 * when the affected code paths are not exercised at runtime.
 *
 * L#NN-HELPER-EXTRACTION-TRIPWIRE-PATTERN v1 N=3 (codified): every helper
 * extraction MUST add a corresponding __no-direct-*-forgeDebug tripwire.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const QUERIES_TS = join(__dirname, 'queries.ts');

describe('L#NN-50 tripwire — schedules/manager/queries.ts forgeDebug hygiene (cycle 23)', () => {
  it('queries.ts has 0 direct forgeDebug(...) calls (must use queriesSchedulesManagerDebug helper)', () => {
    const src = readFileSync(QUERIES_TS, 'utf8');
    // Strip INTENTIONAL DIRECT LOG lines per L#NN-13 13a convention.
    const cleaned = src
      .split('\n')
      .filter((line) => !line.includes('INTENTIONAL DIRECT LOG'))
      .join('\n');
    // Count `forgeDebug(` occurrences as direct calls (not `queriesSchedulesManagerDebug(`).
    const matches = cleaned.match(/\bforgeDebug\s*\(/g);
    const count = matches ? matches.length : 0;
    expect(count).toBe(0);
  });

  it('queries.ts uses queriesSchedulesManagerDebug at all 3 legacy call sites (sanity)', () => {
    const src = readFileSync(QUERIES_TS, 'utf8');
    const matches = src.match(/queriesSchedulesManagerDebug\s*\(/g);
    expect(matches ? matches.length : 0).toBeGreaterThanOrEqual(3);
  });
});

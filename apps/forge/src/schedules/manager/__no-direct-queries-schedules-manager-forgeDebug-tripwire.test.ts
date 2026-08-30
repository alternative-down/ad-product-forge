/**
 * Tripwire (regression for cycle 23 — queriesSchedulesManagerDebug extraction):
 * all forgeDebug calls in schedules/manager/queries.ts and lifecycle-ops.ts
 * must go through the centralized queriesSchedulesManagerDebug helper, not as
 * direct calls.
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
 *
 * D46 cycle 9 expansion: lifecycle-ops.ts joined the helper-protectee list
 * after 2 sites were migrated from direct forgeDebug to
 * queriesSchedulesManagerDebug. Helper broadening (level error → debug/info/warn/error)
 * documented in queries-debug.ts.
 */

import { readFileSync } from 'node:fs';
import { } from '../../tripwire-helpers'; // D61: tripwire-helpers adoption (L#NN-32 v8 meta-tripwire)
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const QUERIES_TS = join(__dirname, 'queries.ts');
const LIFECYCLE_OPS_TS = join(__dirname, 'lifecycle-ops.ts');

describe('L#NN-50 tripwire — schedules/manager/ queries.ts + lifecycle-ops.ts forgeDebug hygiene', () => {
  it('queries.ts has 0 direct forgeDebug(...) calls (must use queriesSchedulesManagerDebug helper)', () => {
    const src = readFileSync(QUERIES_TS, 'utf8');
    const cleaned = src
      .split('\n')
      .filter((line) => !line.includes('INTENTIONAL DIRECT LOG'))
      .join('\n');
    const matches = cleaned.match(/\bforgeDebug\s*\(/g);
    const count = matches ? matches.length : 0;
    expect(count).toBe(0);
  });

  it('queries.ts uses queriesSchedulesManagerDebug at all 3 legacy call sites (sanity)', () => {
    const src = readFileSync(QUERIES_TS, 'utf8');
    const matches = src.match(/queriesSchedulesManagerDebug\s*\(/g);
    expect(matches ? matches.length : 0).toBeGreaterThanOrEqual(3);
  });

  it('lifecycle-ops.ts has 0 direct forgeDebug(...) calls (must use queriesSchedulesManagerDebug helper, cycle 9)', () => {
    const src = readFileSync(LIFECYCLE_OPS_TS, 'utf8');
    const cleaned = src
      .split('\n')
      .filter((line) => !line.includes('INTENTIONAL DIRECT LOG'))
      .join('\n');
    const matches = cleaned.match(/\bforgeDebug\s*\(/g);
    const count = matches ? matches.length : 0;
    expect(count).toBe(0);
  });

  it('lifecycle-ops.ts uses queriesSchedulesManagerDebug at both migrated call sites (cycle 9 sanity)', () => {
    const src = readFileSync(LIFECYCLE_OPS_TS, 'utf8');
    const matches = src.match(/queriesSchedulesManagerDebug\s*\(/g);
    expect(matches ? matches.length : 0).toBe(2);
  });
});

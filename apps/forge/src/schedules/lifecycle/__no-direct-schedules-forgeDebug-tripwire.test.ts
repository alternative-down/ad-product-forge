/**
 * Tripwire (regression for #5594): all warn-level forgeDebug calls in the
 * schedules/lifecycle/ subsystem must go through the centralized
 * logScheduleWarning helper, not as direct calls. Direct calls defeat the
 * purpose of the helper (centralized scope/level management) and signal a
 * drift back to the pre-#5594 copy-paste pattern.
 *
 * Allow-list:
 *   - The helper itself (logScheduleWarning) at the top of lifecycle.ts.
 *     The helper is the ONE legitimate place that calls
 *     forgeDebug({ scope: 'schedules', level: 'warn', ... }) directly.
 *
 *   - Lines annotated with the comment marker // INTENTIONAL DIRECT LOG are
 *     exempt (consistent with L#NN-13 13a tripwire convention; the marker
 *     documents the override and is searchable for future audits).
 *
 * This is a static (regex over source) check so it catches regressions even
 * when the affected code paths are not exercised at runtime.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCAN_DIR = join(__dirname);

describe('L#NN-50 tripwire — schedules/lifecycle/ forgeDebug hygiene (#5594)', () => {
  const files = readdirSync(SCAN_DIR).filter((f) => {
    if (!f.endsWith('.ts')) return false;
    if (f.endsWith('.test.ts')) return false;
    if (f.startsWith('__')) return false; // this tripwire file
    return statSync(join(SCAN_DIR, f)).isFile();
  });

  it('contains the expected non-test .ts files (sanity)', () => {
    // The lifecycle/ dir has these impl files per the #5594 refactor scope.
    expect(files).toContain('lifecycle.ts');
    expect(files).toContain('heartbeat.ts');
    expect(files).toContain('cron.ts');
  });

  /**
   * Counts `forgeDebug({ scope: 'schedules', level: 'warn' ... })` direct
   * calls in a file's source. Strips INTENTIONAL DIRECT LOG lines first so
   * the marker genuinely exempts a call.
   */
  function countDirectSchedulesWarnCalls(src: string): number {
    const cleaned = src
      .split('\n')
      .filter((line) => !line.includes('INTENTIONAL DIRECT LOG'))
      .join('\n');
    const matches = cleaned.match(
      /forgeDebug\(\s*\{\s*scope:\s*['"]schedules['"]\s*,\s*level:\s*['"]warn['"]/g,
    );
    return matches ? matches.length : 0;
  }

  for (const filename of files) {
    it(`${filename} has 0 direct forgeDebug({scope:'schedules', level:'warn', ...}) calls (must use logScheduleWarning helper)`, () => {
      const src = readFileSync(join(SCAN_DIR, filename), 'utf8');
      const count = countDirectSchedulesWarnCalls(src);
      // lifecycle.ts contains the helper itself (1 call); other files should have 0.
      const allowed = filename === 'lifecycle.ts' ? 1 : 0;
      expect(count).toBe(allowed);
    });
  }

  it('lifecycle.ts contains the logScheduleWarning helper definition (sanity)', () => {
    const src = readFileSync(join(SCAN_DIR, 'lifecycle.ts'), 'utf8');
    expect(src).toMatch(/export\s+function\s+logScheduleWarning\s*\(/);
  });
});

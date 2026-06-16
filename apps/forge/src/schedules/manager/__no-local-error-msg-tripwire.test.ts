import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Tripwire (regression for #5605 + #5610): files in `schedules/manager/` must
//   (1) NOT re-declare a local `function errorMsg` (canonical impl in
//       `agents/error-formatting.ts`), AND
//   (2) `manager.ts` must keep the defensive `getLifecycle().cancel(...)`
//       inside the `updateSchedule` catch block, after the `forgeDebug` log
//       and before the conditional re-`register`. The cancel is what prevents
//       a residual registered entry from firing against stale DB state when
//       the post-update `register` call fails partway (Pattern: same defensive
//       cancel already exists in `updateOwnedSchedule`'s catch block — see
//       issue #5605).
//
// Both checks are static (regex over the source) so they catch regressions
// even when the affected code paths are not exercised at runtime.

const SCAN_DIR = join(__dirname);

describe('L#19 tripwire — schedules/manager/ hygiene + #5605 defensive cancel', () => {
  const files = readdirSync(SCAN_DIR).filter((f) => {
    if (!f.endsWith('.ts')) return false;
    if (f.endsWith('.test.ts')) return false;
    if (f.startsWith('__')) return false; // this tripwire file
    return statSync(join(SCAN_DIR, f)).isFile();
  });

  it('manager/ contains the expected non-test .ts files (sanity)', () => {
    // 7 implementation files: auth, index, manager, normalize, store (+ 2 hidden test infra).
    // We assert at least 5 canonical impl files exist (auth/index/manager/normalize/store).
    const expected = ['auth.ts', 'index.ts', 'manager.ts', 'normalize.ts', 'store.ts'];
    for (const f of expected) {
      expect(files).toContain(f);
    }
  });

  for (const filename of files) {
    it(`${filename} must not declare a local function errorMsg`, () => {
      const src = readFileSync(join(SCAN_DIR, filename), 'utf8');
      expect(src).not.toMatch(/function\s+errorMsg\s*\(/);
    });
  }

  describe('#5605 defensive cancel in updateSchedule catch block (split across sub-modules after #5737)', () => {
    // After #5737 refactor, the updateSchedule logic moved to mutations.ts.
    // The defensive cancel pattern must still exist somewhere in the manager/ directory.
    const allImplSrc = files.map((f) => readFileSync(join(SCAN_DIR, f), 'utf8')).join('\n\n');

    it('manager/ contains the "updateSchedule: scheduler registration failed, DB rolled back" forgeDebug', () => {
      expect(allImplSrc).toMatch(/message:\s*'updateSchedule: scheduler registration failed, DB rolled back'/);
    });

    it('manager/ contains a getLifecycle().cancel(scheduleId) call AFTER the "rolled back" log AND BEFORE the conditional re-register (defensive cancel — issue #5605)', () => {
      const pattern =
        /message:\s*'updateSchedule: scheduler registration failed, DB rolled back'[\s\S]{0,800}?getLifecycle\(\)\!?\.cancel\(scheduleId\)[\s\S]{0,800}?isActiveSchedule\(restored\)\s*===\s*true/;
      expect(allImplSrc).toMatch(pattern);
    });
  });
});

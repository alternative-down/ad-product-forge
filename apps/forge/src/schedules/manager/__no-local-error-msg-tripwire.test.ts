import { describe, expect, it } from 'vitest';
import { findSourceFiles, readSource } from '../../tripwire-helpers';

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

describe('L#19 tripwire — schedules/manager/ hygiene + #5605 defensive cancel', () => {
  const files = findSourceFiles(__dirname);
  // findSourceFiles returns full paths; map to basenames for path-free assertions.
  const basenames = files.map((f) => f.split('/').pop() ?? f);

  it('manager/ contains the expected non-test .ts files (sanity)', () => {
    // 7 implementation files: auth, index, manager, normalize, store (+ 2 hidden test infra).
    // We assert at least 5 canonical impl files exist (auth/index/manager/normalize/store).
    const expected = ['auth.ts', 'index.ts', 'manager.ts', 'normalize.ts', 'store.ts'];
    for (const f of expected) {
      expect(basenames).toContain(f);
    }
  });

  for (const filename of files) {
    it(`${filename} must not declare a local function errorMsg`, () => {
      const src = readSource(filename);
      expect(src).not.toMatch(/function\s+errorMsg\s*\(/);
    });
  }

  describe('#5605 defensive cancel in updateSchedule catch block (split across sub-modules after #5737)', () => {
    // After #5737 refactor, the updateSchedule logic moved to mutations.ts.
    // After #5863 migration, the rollback + defensive cancel pattern still exists in
    // the catch block that wraps withDbErrorLogging. The Format A message is now
    // generic (`${op} DB ${verb} failed`), so the tripwire checks for the
    // withDbErrorLogging call + defensive cancel + conditional re-register shape.
    const allImplSrc = files.map((f) => readSource(f)).join('\n\n');

    it('manager/ contains the withDbErrorLogging wrap for updateSchedule', () => {
      expect(allImplSrc).toMatch(/op:\s*'updateSchedule'[\s\S]{0,400}?getLifecycle\(\)!\.register\(toScheduleRecord\(updated\)\)/);
    });

    it('manager/ contains a getLifecycle().cancel(scheduleId) call AFTER the "restored =" rollback AND BEFORE the conditional re-register (defensive cancel — issue #5605)', () => {
      const pattern =
        /restored\s*=\s*await\s*store\.updateAgentSchedule\([\s\S]{0,400}?getLifecycle\(\)!?\.cancel\(scheduleId\)[\s\S]{0,400}?isActiveSchedule\(restored\)\s*===\s*true/;
      expect(allImplSrc).toMatch(pattern);
    });
  });
});

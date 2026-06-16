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

  describe('#5605 defensive cancel in updateSchedule catch block', () => {
    const managerSrc = readFileSync(join(SCAN_DIR, 'manager.ts'), 'utf8');

    it('manager.ts contains the "updateSchedule: update failed, rolled back" forgeDebug', () => {
      expect(managerSrc).toMatch(/message:\s*'updateSchedule: update failed, rolled back'/);
    });

    it('manager.ts contains a getLifecycle().cancel(scheduleId) call AFTER the "rolled back" log AND BEFORE the conditional re-register (defensive cancel — issue #5605)', () => {
      // Match the order: rolled-back log → cancel(scheduleId) → if (... isActiveSchedule ...) register(restored ...)
      // Use a single regex with lookaheads to assert ordering.
      const pattern =
        /message:\s*'updateSchedule: update failed, rolled back'[\s\S]{0,800}?getLifecycle\(\)\.cancel\(scheduleId\)[\s\S]{0,800}?isActiveSchedule\(restored\)\s*===\s*true/;
      expect(managerSrc).toMatch(pattern);
    });
  });
});

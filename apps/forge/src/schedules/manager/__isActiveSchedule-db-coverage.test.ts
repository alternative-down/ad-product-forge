/**
 * isActiveSchedule DB boolean coverage (Lead 8 #5739 Phase 2 follow-up, Veritas 1/2 request)
 *
 * BACKGROUND:
 *   Lead 8 #5739 Phase 2 surfaced a pre-existing bug: `isActiveSchedule` had
 *   `return s.isActive === true` which returned false for DB-derived records
 *   (Drizzle stores `isActive: 0|1` as integer). The bug was masked by
 *   `as unknown as StoredSchedule` casts throughout manager.ts.
 *
 *   Lead 8 Phase 2 fix: `s.isActive === true || s.isActive === 1` to accept
 *   both `boolean` and DB-integer forms.
 *
 * VERITAS L#NN-26 v1 MUTATION:
 *   When the `|| s.isActive === 1` clause is removed, all 127 existing tests
 *   still pass — meaning the fix is necessary for correctness but not
 *   regression-guarded. This file provides the 5-case coverage so future
 *   refactors cannot accidentally remove the OR clause.
 *
 * L#NN-13 13a COMPLIANCE:
 *   - stripComments() not needed (this is pure function, no comments)
 *   - L#NN-26 v1 mutation validator: test fails when OR clause is removed
 *   - L#NN-26 v2 false-positive check: not applicable (no false positives possible)
 *   - Header doc: this file
 *   - FAIL case assertion: each test case has a clear expected value
 */

import { describe, expect, it } from 'vitest';

import { isActiveSchedule } from './manager';

describe('isActiveSchedule (DB boolean handling) — Lead 8 #5739 Phase 2 regression guard', () => {
  it('isActive: true → true (boolean active)', () => {
    expect(isActiveSchedule({ isActive: true })).toBe(true);
  });

  it('isActive: false → false (boolean inactive)', () => {
    expect(isActiveSchedule({ isActive: false })).toBe(false);
  });

  it('isActive: 1 → true (DB integer active, pre-Phase 2 BUG)', () => {
    // This is the case that was broken before Phase 2.
    // DB stores isActive as integer 0|1; the OR clause handles this.
    expect(isActiveSchedule({ isActive: 1 })).toBe(true);
  });

  it('isActive: 0 → false (DB integer inactive)', () => {
    expect(isActiveSchedule({ isActive: 0 })).toBe(false);
  });

  it('isActive: 2 (invalid integer) → false (defensive: only 0|1 are valid)', () => {
    // Defensive: any integer other than 1 is treated as inactive.
    // This prevents a typo (e.g., `=== 2`) from accidentally re-introducing
    // a wrong-true case.
    expect(isActiveSchedule({ isActive: 2 })).toBe(false);
  });
});

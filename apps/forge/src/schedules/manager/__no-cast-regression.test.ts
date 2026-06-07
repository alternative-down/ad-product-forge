/**
 * L#19 tripwire for #5608 (Cluster B cast removal).
 *
 * Verifies that `manager.ts` does NOT re-introduce `scheduleType as 'cron' | 'date'`
 * casts. Post-Aldric T1 (#5618), `NormalizedScheduleUpdate.scheduleType: ScheduleType`
 * is the literal union — no cast needed at the 6 sites (L220, L225, L234, L312, L317, L326).
 *
 * Tripwire behavior: if any of these patterns re-appear, this test fails loudly.
 *
 * Also tracks that Cluster A (8 sites of `as unknown as ScheduleLifecycleRecord`)
 * is STILL REQUIRED for type compatibility — `AgentSchedule` has extra fields
 * (lastTriggeredAt, nextTriggerAt, creatorId) that don't fit `ScheduleLifecycleInput`.
 * Removal of Cluster A requires a structural change to either the lifecycle input type
 * or the AgentSchedule shape — not in scope for #5608 cascade.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MANAGER_TS = join(import.meta.dirname, 'manager.ts');
const managerContent = readFileSync(MANAGER_TS, 'utf8');

describe('L#19 tripwire for #5608 cast removal', () => {
  it('manager.ts has 0 redundant `scheduleType as cron|date` casts (Cluster B, post-#5618)', () => {
    const matches = managerContent.match(/scheduleType as 'cron' \| 'date'/g) ?? [];
    expect(matches).toHaveLength(0);
  });

  it('manager.ts has exactly 8 Cluster A casts (type compatibility requirement, deferred removal)', () => {
    // Cluster A cast removal requires AgentSchedule shape change — out of scope for #5608 cascade.
    // When that's done, update this expectation to 0 and add a second structural check.
    const matches = managerContent.match(/as unknown as ScheduleLifecycleRecord/g) ?? [];
    expect(matches).toHaveLength(8);
  });

  it('manager.test.ts has ≤1 `as cron|date` cast in fixture (test fixture L124 KEEP)', () => {
    // Test fixture at L124: scheduleType: row.scheduleType as 'cron' | 'date' is KEEP
    // (narrows from `Record<string, unknown>` to literal union — needed for ScheduleRow type).
    const testFile = join(import.meta.dirname, 'manager.test.ts');
    const testContent = readFileSync(testFile, 'utf8');
    const matches = testContent.match(/as 'cron' \| 'date'/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(1);
  });

  it('manager.ts register() calls all have the `as unknown as ScheduleLifecycleRecord` cast (L#25 defense)', () => {
    // Spot-check: every getLifecycle().register() call has the cast.
    // If the type contract changes (Cluster A removal becomes possible), this fails — that's the tripwire.
    const registerCalls = managerContent.match(/getLifecycle\(\)\.register\([^)]+\)/g) ?? [];
    const total = registerCalls.length;
    const withCast = registerCalls.filter((c) => c.includes('as unknown as ScheduleLifecycleRecord')).length;
    expect(withCast).toBe(total);
    expect(total).toBe(8);
  });
});

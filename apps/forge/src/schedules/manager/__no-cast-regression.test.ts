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

  it('manager.ts has 0 Cluster A casts (Lead 8 #5739 Phase 2 DONE: all 8 removed)', () => {
    // Lead 8 #5739 Phase 2 fix: widened store._applyUpdate return type, exported toScheduleRecord,
    // widened normalize.ExistingScheduleFields, removed all 8 `as unknown as ScheduleLifecycleRecord` casts.
    // 6 register() calls wrap in toScheduleRecord(); 2 receive post-conversion ScheduleRecord directly.
    const matches = managerContent.match(/as unknown as ScheduleLifecycleRecord/g) ?? [];
    expect(matches).toHaveLength(0);
  });

  it('manager.test.ts has ≤1 `as cron|date` cast in fixture (test fixture L124 KEEP)', () => {
    // Test fixture at L124: scheduleType: row.scheduleType as 'cron' | 'date' is KEEP
    // (narrows from `Record<string, unknown>` to literal union — needed for ScheduleRow type).
    const testFile = join(import.meta.dirname, 'manager.test.ts');
    const testContent = readFileSync(testFile, 'utf8');
    const matches = testContent.match(/as 'cron' \| 'date'/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(1);
  });

  it('manager/ register() calls are all safe (Lead 8 #5739 Phase 2: 6 use toScheduleRecord(), 2 receive post-conversion ScheduleRecord) — split across sub-modules after #5737', () => {
    // After #5737 refactor, register() calls moved to mutations.ts and lifecycle-ops.ts.
    // The contract: no `as unknown as` casts remain anywhere in the manager/ directory.
    // After #5945, lifecycle-ops.ts L52 was refactored to use a local `lifecycle`
    // variable with explicit null handling, so that single register() call no longer
    // uses the `getLifecycle()!` pattern. The OTHER 7 calls in mutations.ts still
    // use `getLifecycle()!`. Both patterns are valid; the total ≥8 contract is
    // what matters (proves all expected schedule paths still register).
    const { readFileSync, readdirSync, statSync } = require('node:fs');
    const { join } = require('node:path');
    const scanDir = join(import.meta.dirname);
    const implFiles = readdirSync(scanDir).filter((f: string) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.startsWith('__') && statSync(join(scanDir, f)).isFile());
    const allImplSrc = implFiles.map((f: string) => readFileSync(join(scanDir, f), 'utf8')).join('\n\n');
    const unsafeCasts = allImplSrc.match(/as unknown as/g) ?? [];
    expect(unsafeCasts).toHaveLength(0);
    // Count BOTH patterns: `getLifecycle()!` (mutations.ts) and `lifecycle.` (lifecycle-ops.ts).
    const getLifecycleCalls = allImplSrc.match(/getLifecycle\(\)!\.register\(/g) ?? [];
    const lifecycleCalls = allImplSrc.match(/lifecycle\.register\(/g) ?? [];
    expect(getLifecycleCalls.length + lifecycleCalls.length).toBeGreaterThanOrEqual(8);
  });
});

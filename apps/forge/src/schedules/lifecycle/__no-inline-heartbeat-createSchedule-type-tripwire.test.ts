/**
 * L#NN-50 tripwire (regression for #5574): heartbeat.ts must derive the
 * createSchedule input type from the real store via Parameters<ReturnType<>>,
 * not inline-declare it. Catches re-introduction of the duplicate-type antipattern.
 *
 * Type-derivation family: L#NN-50 N=3 sub-family (file-scoped input-type check).
 * Sibling to: Zod schema coverage, duplicate-step, auto-merge.yml.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const HEARTBEAT_PATH = join(__dirname, 'heartbeat.ts');

describe('heartbeat.ts must derive createSchedule input from store (regression for #5574)', () => {
  it('does not inline-declare the createSchedule input type', () => {
    const src = readFileSync(HEARTBEAT_PATH, 'utf8');
    // Anti-pattern: createSchedule(input: { (inline object type literal)
    const inlinePattern = /createSchedule\s*\(\s*input\s*:\s*\{/;
    expect(
      src,
      'heartbeat.ts must NOT inline-declare the createSchedule input type. Derive via Parameters<typeof createAgentScheduleStore>[0] instead. See #5574.',
    ).not.toMatch(inlinePattern);
  });

  it('uses Parameters<> to derive the input type', () => {
    const src = readFileSync(HEARTBEAT_PATH, 'utf8');
    expect(
      src,
      'heartbeat.ts must use Parameters<> to derive the createSchedule input type. See #5574.',
    ).toMatch(/Parameters\s*<[^>]*ReturnType[^>]*>/);
  });

  it('does not pass redundant default fields in createSchedule call (regression for #5574)', () => {
    // Per #5574 cleanup: description/scheduledDate/wakeWhenRunning are optional in the
    // real type and have store defaults. Heartbeat.ts should not pass them explicitly.
    const src = readFileSync(HEARTBEAT_PATH, 'utf8');
    // The createSchedule call must not have description:, scheduledDate:, or wakeWhenRunning: as keys
    // (within the input.store.createSchedule({ ... }) block).
    expect(
      src,
      'heartbeat.ts must not pass description/scheduledDate/wakeWhenRunning in createSchedule call — these are optional in the real type with store defaults. See #5574.',
    ).not.toMatch(/description\s*:/);
    expect(src).not.toMatch(/scheduledDate\s*:/);
    expect(src).not.toMatch(/wakeWhenRunning\s*:/);
  });
});

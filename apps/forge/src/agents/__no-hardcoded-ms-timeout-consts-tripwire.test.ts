/**
 * Tripwire (L#NN-50 family #5): no hardcoded ms in named timeout/interval/delay/ttl consts.
 *
 * Enforces the rule that any const named *_TIMEOUT_MS / *_INTERVAL_MS / *_DELAY_MS / *_TTL_MS
 * must derive its value from the central time-constants module, not a literal numeric.
 *
 * Multipliers of named constants are allowed (e.g., `2 * ONE_MINUTE_MS`, `5 * ONE_SECOND_MS`)
 * because the multiplier expresses "how many of this unit" not a raw millisecond count.
 *
 * Excluded paths:
 * - time-constants.ts itself (this is the source of truth)
 * - test files (fixtures / mocks may use literal values)
 * - declaration files (.d.ts)
 */
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();

/**
 * Returns lines where a *_TIMEOUT_MS / *_INTERVAL_MS / *_DELAY_MS / *_TTL_MS const
 * is assigned a PURE numeric literal (e.g., `= 30_000;` or `= 5_000,`).
 *
 * Multipliers like `2 * ONE_MINUTE_MS` are intentionally excluded because they
 * reference a named time-constants primitive.
 */
function findPureHardcodedMsConsts(): string {
  // Note: regex pattern is single-quoted to prevent shell interpretation of () | []
  const cmd = `grep -rEn '(TIMEOUT|INTERVAL|DELAY|TTL)_MS[[:space:]]*=[[:space:]]*[0-9][0-9_]*[[:space:]]*[;),}]' apps/forge/src --include='*.ts' 2>/dev/null | grep -v 'time-constants.ts' | grep -v '.test.ts' | grep -v '.d.ts' || true`;
  return execSync(cmd, { encoding: 'utf-8', cwd: REPO_ROOT }).trim();
}

describe('L#NN-50 family #5: no hardcoded ms in named timeout consts', () => {
  it('every *_TIMEOUT_MS / *_INTERVAL_MS / *_DELAY_MS / *_TTL_MS const references time-constants', () => {
    const result = findPureHardcodedMsConsts();
    expect(
      result,
      `Found pure-numeric values in named timeout/interval/delay/ttl consts:\n${result}`,
    ).toBe('');
  });
});

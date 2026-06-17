import { describe, expect, it } from 'vitest';
import { findSourceFiles, readSource } from '../../../../tripwire-helpers';

// Tripwire (regression for #5579): files in `admin/routes/agents/_split/` must
// NOT re-declare a local `function errorMsg`. The canonical implementation lives
// in `agents/error-formatting.ts` and is shared across the codebase.
//
// Before this fix, 3 files (lifecycle-delegate-ops.ts, lifecycle-ops.ts,
// mcp-ops.ts) re-declared the exact same 5-line `errorMsg` function locally,
// creating a 3d LAW (Don't Repeat Yourself) violation: the same code lived
// in 4 places, and any change to error-serialization had to be applied
// 4 times. This tripwire catches any re-introduction of the antipattern.

describe('error handler dedup tripwire (regression for #5579)', () => {
  const splitFiles = findSourceFiles(__dirname);

  it('_split/ contains 8 non-test .ts files (sanity)', () => {
    expect(splitFiles).toHaveLength(7);
  });

  for (const filename of splitFiles) {
    it(`${filename} must not declare a local function errorMsg`, () => {
      const src = readSource(filename);
      expect(src).not.toMatch(/function\s+errorMsg\s*\(/);
    });
  }
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Tripwire (regression for #5579): files in `admin/routes/agents/_split/` must
// NOT re-declare a local `function errorMsg`. The canonical implementation lives
// in `agents/error-formatting.ts` and is shared across the codebase.
//
// Before this fix, 3 files (lifecycle-delegate-ops.ts, lifecycle-ops.ts,
// mcp-ops.ts) re-declared the exact same 5-line `errorMsg` function locally,
// creating a 3d LAW (Don't Repeat Yourself) violation: the same code lived
// in 4 places, and any change to error-serialization had to be applied
// 4 times. This tripwire catches any re-introduction of the antipattern.

const SPLIT_DIR = join(__dirname);

describe('error handler dedup tripwire (regression for #5579)', () => {
  const splitFiles = readdirSync(SPLIT_DIR).filter((f) => {
    if (!f.endsWith('.ts')) return false;
    if (f.endsWith('.test.ts')) return false;
    if (f.startsWith('__')) return false; // this tripwire file
    const full = join(SPLIT_DIR, f);
    return statSync(full).isFile();
  });

  it('_split/ contains 8 non-test .ts files (sanity)', () => {
    expect(splitFiles).toHaveLength(7);
  });

  for (const filename of splitFiles) {
    it(`${filename} must not declare a local function errorMsg`, () => {
      const src = readFileSync(join(SPLIT_DIR, filename), 'utf8');
      expect(src).not.toMatch(/function\s+errorMsg\s*\(/);
    });
  }
});

/**
 * L#NN-50 silent-failure tripwire test (issue #5984).
 *
 * Background:
 *   The `withDbErrorLogging` helper historically accepted a
 *   `mode: 'throw' | 'return-null' | 'return-empty-array'` parameter that
 *   allowed call-sites to silently swallow DB errors and return a placeholder.
 *   This was the root cause of the silent-failure cluster (#5984 + #5975 +
 *   #5976 + #5977 + #5978).
 *
 *   As of this PR (#5984), the helper ALWAYS re-throws. The `mode` parameter
 *   and `ErrorLoggingMode` type were removed. Call-sites that want to handle
 *   "no row" gracefully must rely on the underlying query's natural contract
 *   (findFirst returning undefined) — DB errors are no longer hideable.
 *
 * This tripwire is a static-analysis guard that:
 *   1. Fails if ANY `*.ts` file (production source or test) contains
 *      `mode: 'return-null'`, `mode: 'return-empty-array'`, or
 *      `mode: 'throw'` as a `withDbErrorLogging` argument.
 *      (Note: the legacy throw-mode is also banned because the parameter
 *      itself was removed — even passing `mode: 'throw'` would be a type
 *      error today, but this guard is defensive against drifted callers
 *      that may have been migrated by accident.)
 *   2. Fails if ANY file imports the removed `ErrorLoggingMode` type.
 *   3. The ONLY exception is the helper's own JSDoc comment at
 *      `apps/forge/src/database/error-logging.ts:58` which documents the
 *      historical pattern for posterity. That comment is intentionally NOT
 *      code and is excluded from the scan (see `ALLOWED_REFERENCE`).
 *
 * Why a static check (vs a runtime test)?
 *   The bug class is structural: it is about how `withDbErrorLogging` is
 *   CALLED. A runtime test cannot detect a call-site that passes a
 *   `mode:` parameter — TS will (correctly) reject it, but the regression
 *   risk is at PR-review time, not runtime. This tripwire ensures the
 *   pattern does not silently come back during a future refactor that
 *   re-introduces the parameter.
 *
 * ─── Related ─────────────────────────────────────────────────────────────
 *
 *   - #5984: This PR — root-cause silent-failure removal
 *   - #5975/#5976/#5977: notifications/store.ts cluster (closed by #5989 PR; this
 *                       tripwire prevents reintroduction of the helper-mode enabler)
 *   - #5978: loadAgents Promise.allSettled silent partial-failure (closed in this PR)
 *   - L#NN-50: codification pattern (per-tripwire + cumulative guard)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// Path from test file (apps/forge/src/database/) one level up = apps/forge/src/
const FORGE_SRC = join(import.meta.dirname, '..');

/**
 * Files that may legitimately mention the historical `mode:` / `ErrorLoggingMode`
 * pattern in comments (e.g. the helper's own deprecation note). Other files
 * must NOT reference these patterns at all.
 */
const ALLOWED_REFERENCE_PATHS = new Set<string>([
  join(FORGE_SRC, 'database', 'error-logging.ts'), // the helper's own JSDoc
  join(FORGE_SRC, 'database', '__lnn-50-no-silent-failure-mode-tripwire.test.ts'), // this test
]);

/** Recursively collect all .ts files under apps/forge/src. */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (entry.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

interface Violation {
  file: string;
  line: number;
  text: string;
  pattern: string;
}

/**
 * Detect any reintroduction of the silent-failure pattern.
 *
 * Patterns banned:
 *   1. `mode: 'return-null'`     — was: helper returned null on DB error
 *   2. `mode: 'return-empty-array'` — was: helper returned [] on DB error
 *   3. `mode: 'throw'`           — was: default behaviour. Banned because the
 *                                   parameter itself was REMOVED — any caller
 *                                   passing this would be a TS error, so this
 *                                   is a defensive guard for migration drift.
 *   4. `ErrorLoggingMode`        — was: the exported type literal. Imports
 *                                   should fail (TS error) and this is a
 *                                   defensive guard for migration drift.
 *
 * The patterns are matched as whole-property-quoted values to minimize
 * false positives (e.g., a comment containing "should return-null on…" is
 * NOT a violation because there's no `mode:`).
 */
function findSilentFailureModeViolations(content: string): Array<{ line: number; text: string; pattern: string }> {
  const lines = content.split('\n');
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Pattern 1-3: mode: '<one-of-three>'
    const modeMatch = line.match(/mode:\s*['"`](return-null|return-empty-array|throw)['"`]/);
    if (modeMatch) {
      results.push({ line: i + 1, text: line.trim(), pattern: 'mode:' });
      continue;
    }
    // Pattern 4: ErrorLoggingMode reference (type import or annotation)
    if (/\bErrorLoggingMode\b/.test(line)) {
      results.push({ line: i + 1, text: line.trim(), pattern: 'ErrorLoggingMode' });
    }
  }
  return results;
}

describe('silent-failure-mode tripwire (issue #5984)', () => {
  const tsFiles = collectTsFiles(FORGE_SRC);

  it('no file re-introduces mode: or ErrorLoggingMode', () => {
    const violations: Violation[] = [];
    for (const file of tsFiles) {
      // Use basename matching. Comparing only the trailing filename
            // sidesteps absolute-vs-relative path normalization issues
            // across platforms (Windows \\ vs /) and lets the tripwire
            // file itself + the helper's own JSDoc mention the historical
            // pattern in prose without triggering the scan.
            const fileBase = file.split(/[/\\]/).pop();
            const ALLOWED_BASENAMES = new Set(
              Array.from(ALLOWED_REFERENCE_PATHS).map((p) => p.split(/[/\\]/).pop()),
            );
            if (ALLOWED_BASENAMES.has(fileBase)) continue;
            const content = readFileSync(file, 'utf8');
      const matches = findSilentFailureModeViolations(content);
      for (const match of matches) {
        violations.push({
          file: file.replace(process.cwd() + '/', ''),
          line: match.line,
          text: match.text,
          pattern: match.pattern,
        });
      }
    }

    if (violations.length > 0) {
      const summary = violations
        .map((v) => '  ' + v.file + ':' + v.line + ' [' + v.pattern + ']\n    ' + v.text)
        .join('\n');
      throw new Error(
        'Silent-failure mode pattern re-introduced in ' +
          violations.length +
          ' location(s).\n' +
          'Issue #5984 removed the `mode` parameter from `withDbErrorLogging`.\n' +
          'Use the helper WITHOUT `mode:` — DB errors always re-throw.\n' +
          'For "not found" handling, use findOrThrow or rely on findFirst returning undefined.\n\n' +
          summary,
      );
    }
  });

  it('scans a non-trivial number of files (sanity check)', () => {
    // If `collectTsFiles` ever breaks and returns [] / [thisFile], this
    // catches it. The codebase has hundreds of .ts files.
    expect(tsFiles.length).toBeGreaterThan(50);
  });

  it('documents the allow-listed reference paths (informational)', () => {
    // Soft check: prints the allow-list so future maintainers can see WHY
    // these files are excluded.
    // Use basename comparison for the allow-list assertion because
        // process.cwd() varies between turbo task contexts (workspace
        // root vs apps/forge), which breaks absolute-path normalization.
        const expectedBasenames = [
          'error-logging.ts',
          '__lnn-50-no-silent-failure-mode-tripwire.test.ts',
        ];
        const observedBasenames = Array.from(ALLOWED_REFERENCE_PATHS).map((p) =>
          p.split(/[/\\]/).pop(),
        );
        for (const expected of expectedBasenames) {
          expect(observedBasenames).toContain(expected);
        }
        console.log('Tripwire allow-list basenames:', observedBasenames);
  });
});

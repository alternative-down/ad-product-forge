/**
 * L#NN-50 tripwire helpers — shared boilerplate for source-level regression tests
 * (issue #5782).
 *
 * Background: L#NN-50 tripwires (regression guards for refactor/copy-paste fixes)
 * all use the same imports and helper functions. Each tripwire re-declared
 * the boilerplate, leading to ~10 LoC of duplication per tripwire and
 * inconsistency in how `join(__dirname, ...)` vs `join(import.meta.dirname, ...)`
 * was used.
 *
 * This module centralizes:
 *  - Path resolution (import.meta.dirname + path.resolve for ESM, cwd-stable)
 *  - File reading (readFileSync wrapper)
 *  - Source-file discovery (readdirSync + filter, excludes test files and __prefixed)
 *  - Regex counting/finding helpers
 *  - Comment stripping (so docstring examples don't trip the regex)
 *
 * Tripwires import from here via:
 *   import { readSource, findSourceFiles, countMatches, findAll, stripComments } from './__tripwire-helpers';
 *
 * Conventions enforced by the helpers:
 *  - All file paths are absolute (resolved against import.meta.dirname)
 *  - Test files (.test.ts) and other tripwires (__*.ts) are excluded from scans
 *  - Lines marked with // INTENTIONAL DIRECT LOG are exempted from comment-stripped
 *    regex checks (per L#NN-13 13a)
 *
 * Risks:
 *  - Shared module = potential bottleneck. If this file breaks, all tripwires
 *    break. Mitigation: keep helpers minimal + tested in __tripwire-helpers.test.ts.
 *  - Migration churn for tripwires that already use the old style. Out-of-scope
 *    tripwires can stay as-is (per issue #5782: opportunistic migration only).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve a path relative to THIS helper module's directory.
 *
 * `import.meta.dirname` is the ESM-native way to get the current file's directory
 * (Node 20.11+). This avoids the `__dirname is not defined` issue in ESM and
 * the `__dirname differs in CJS bundle` issue in vitest with vite-node. Using
 * `path.resolve` makes the result absolute regardless of the test runner's cwd
 * (which addresses Veritas's NOTE on Varek #5781 about cwd fragility).
 *
 * Usage:
 *   const target = relativeToHere('finance/company-cash-operations.ts');
 */
export function relativeToHere(...parts: string[]): string {
  // import.meta.dirname is available in ESM. fileURLToPath(import.meta.url) is
  // the CJS-portable fallback (used in test runners that compile to CJS).
  const here = import.meta.dirname ?? fileURLToPath(new URL('.', import.meta.url));
  return resolve(here, ...parts);
}

/**
 * Read a single source file as UTF-8. Pure wrapper over readFileSync for
 * consistency across tripwires.
 */
export function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

/**
 * Find all .ts files in a directory matching the filter options.
 *
 * Defaults: exclude .test.ts files (so a tripwire doesn't recurse into itself)
 * and exclude files with the tripwire-marker prefix '__' (so tripwires don't
 * scan each other).
 */
export function findSourceFiles(
  dir: string,
  options: { excludePrefixes?: string[]; excludeTest?: boolean } = {}
): string[] {
  const { excludePrefixes = ['__'], excludeTest = true } = options;
  return readdirSync(dir)
    .filter((f) => {
      if (!f.endsWith('.ts')) return false;
      if (excludeTest && f.endsWith('.test.ts')) return false;
      return !excludePrefixes.some((p) => f.startsWith(p));
    })
    .map((f) => join(dir, f))
    .filter((full) => statSync(full).isFile());
}

/**
 * Count regex matches in a source string. Returns 0 if no matches.
 *
 * Usage:
 *   const directCalls = countMatches(src, /forgeDebug\(\s*\{/g);
 *   expect(directCalls).toBe(1);
 */
export function countMatches(src: string, pattern: RegExp): number {
  const matches = src.match(pattern);
  return matches ? matches.length : 0;
}

/**
 * Return all regex matches in a source string as an array of RegExpMatchArray.
 *
 * Usage:
 *   const allCalls = findAll(src, /forgeDebug\(\s*\{/g);
 *   expect(allCalls).toHaveLength(1);
 */
export function findAll(src: string, pattern: RegExp): RegExpMatchArray[] {
  return Array.from(src.matchAll(pattern));
}

/**
 * Strip line comments (// ...) and block comments (/* ... *\/) from source.
 *
 * This prevents docstring examples (e.g., a tripwire that documents the bug
 * pattern in its own header) from tripping the regex. The block-comment
 * regex is non-greedy and handles the common case of single-line block
 * comments. For multi-line block comments, use stripMultilineComments.
 */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

/**
 * Strip lines marked with `// INTENTIONAL DIRECT LOG` (or similar markers)
 * from source. Used to allow per-line exemptions without changing the
 * underlying logic.
 *
 * Usage:
 *   const cleaned = stripIntentionalLines(src, 'INTENTIONAL DIRECT LOG');
 *   const matches = cleaned.match(/forgeDebug\(\s*\{/g);
 *
 * The marker must appear on the SAME line as the pattern (or on a comment
 * line immediately preceding the pattern). This is intentionally strict to
 * prevent accidental blanket exemptions.
 */
export function stripIntentionalLines(src: string, marker: string): string {
  return src
    .split('\n')
    .filter((line) => !line.includes(marker))
    .join('\n');
}

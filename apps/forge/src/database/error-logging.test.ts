import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../agents/error-formatting', () => ({
  errorMsg: vi.fn((err: unknown) => `formatted: ${String(err)}`),
}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { withDbErrorLogging } from './error-logging';
import { forgeDebug } from '@forge-runtime/core';

const mockedForgeDebug = vi.mocked(forgeDebug);

describe('withDbErrorLogging', () => {
  beforeEach(() => {
    mockedForgeDebug.mockReset();
  });

  it('returns the operation result on success', async () => {
    const result = await withDbErrorLogging({
      scope: 'test-store',
      op: 'doThing',
      verb: 'write',
      context: { foo: 'bar' },
      fn: async () => 42,
    });
    expect(result).toBe(42);
    expect(mockedForgeDebug).not.toHaveBeenCalled();
  });

  it('logs via forgeDebug with the legacy format and re-throws on failure', async () => {
    const original = new Error('db connection lost');
    const fn = vi.fn().mockRejectedValue(original);

    await expect(
      withDbErrorLogging({
        scope: 'test-store',
        op: 'doThing',
        verb: 'read',
        context: { agentId: 'a1' },
        fn,
      }),
    ).rejects.toBe(original);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockedForgeDebug).toHaveBeenCalledTimes(1);
    expect(mockedForgeDebug).toHaveBeenCalledWith({
      scope: 'test-store',
      level: 'error',
      message: 'doThing DB read failed',
      context: { agentId: 'a1', error: 'formatted: Error: db connection lost' },
    });
  });

  it('uses "write" verb in the log message for write operations', async () => {
    await expect(
      withDbErrorLogging({
        scope: 'test-store',
        op: 'insert',
        verb: 'write',
        context: {},
        fn: async () => {
          throw new Error('insert failed');
        },
      }),
    ).rejects.toThrow('insert failed');

    expect(mockedForgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'insert DB write failed',
      }),
    );
  });

  it('preserves non-Error throws (e.g., string, object) without crashing', async () => {
    const weirdError = { code: 'WEIRD', detail: 'something' };
    await expect(
      withDbErrorLogging({
        scope: 'test-store',
        op: 'doThing',
        verb: 'read',
        context: {},
        fn: async () => {
          throw weirdError;
        },
      }),
    ).rejects.toBe(weirdError);

    expect(mockedForgeDebug).toHaveBeenCalledTimes(1);
    // errorMsg from error-formatting handles non-Error values
    expect(mockedForgeDebug.mock.calls[0][0].context).toHaveProperty('error');
  });

  it('merges context fields with the error key (error takes precedence on collision)', async () => {
    await expect(
      withDbErrorLogging({
        scope: 'test-store',
        op: 'op',
        verb: 'read',
        // Intentionally shadow `error` to verify the helper's spread order
        context: { error: 'old', extra: 1 } as unknown as Record<string, unknown>,
        fn: async () => {
          throw new Error('boom');
        },
      }),
    ).rejects.toThrow('boom');

    const call = mockedForgeDebug.mock.calls[0]?.[0] as unknown as { context: Record<string, unknown> } | undefined;
    expect(call).toBeDefined();
    // `error` is overwritten by the formatted err — the helper's contract.
    expect(call?.context.error).toBe('formatted: Error: boom');
    expect(call?.context.extra).toBe(1);
  });
});

/**
 * Static-analysis guard test (issue #5485).
 *
 * Enforces Format A across all store files in the codebase by scanning
 * store.ts files under apps/forge/src for the legacy Format B pattern:
 *   - message: '...' + errorMsg(err)   (string concatenation)
 *   - message: `...${errorMsg(err)}...`  (template literal)
 *
 * If any store file uses Format B (inline error in message), this test
 * fails. The fix is to migrate the site to withDbErrorLogging, which
 * always emits Format A.
 *
 * Why a static check (vs a runtime test)? The Format-B problem is
 * structural: it is about how forgeDebug is CALLED at call sites. The
 * unit tests for withDbErrorLogging only verify the helper's own
 * behavior. We need a file-level check to catch new call sites that
 * bypass the helper.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORGE_SRC = join(import.meta.dirname, '..', '..');

/** Recursively collect all store.ts files under apps/forge/src. */
function collectStoreFiles(dir: string): string[] {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectStoreFiles(fullPath));
    } else if (/store\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Detect Format-B pattern in a file.
 *
 * Matches:
 *   1. message: '<prefix>' + errorMsg(err)   (string concatenation)
 *   2. message: `...${errorMsg(err)}...`  (template literal)
 *
 * Does NOT match (these are Format A, the desired form):
 *   - message: 'op DB verb failed'         (bare string, no error)
 *   - context: { ..., error: errorMsg(err) } (error in context, not message)
 */
function findFormatBLocations(content: string): Array<{ line: number; text: string }> {
  const lines = content.split('\n');
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Pattern 1: message: '...' + errorMsg(err) or message: " + errorMsg(err)
    if (/message:\s*['"`].*['"`]\s*\+\s*errorMsg\s*\(/.test(line)) {
      results.push({ line: i + 1, text: line.trim() });
      continue;
    }
    // Pattern 2: message: `...${errorMsg(err)}...`  (template literal)
    if (/message:\s*`[^`]*\$\{[^}]*errorMsg\s*\(/.test(line)) {
      results.push({ line: i + 1, text: line.trim() });
    }
  }
  return results;
}

describe('Log format guard (issue #5485, Format A)', () => {
  const storeFiles = collectStoreFiles(FORGE_SRC);

  it('finds at least one store file (sanity)', () => {
    expect(storeFiles.length).toBeGreaterThan(0);
  });

  it('no NEW Format-B sites have been added (baseline-aware)', () => {
    // Baseline: 9 known Format-B sites in the codebase, pending migration
    // via the broader rollout tracked in #5468.
    //
    // Pre-#5483 the count was 13 (3 in webhooks + 4 in notifications + 5
    // in schedules + 1 in agent-contract-store). After #5483 (webhooks
    // migration), the in-scope count was 9:
    //   - notifications/store.ts: 4 sites
    //   - schedules/manager/store.ts: 5 sites
    // After #5607 (Varek: 5 sites in schedules/manager/store.ts migrated),
    // the in-scope count is 4 (all in notifications/store.ts).
    // (agent-contract-store.ts is out of scope per Aldric's boundary.)
    //
    // As #5468 (broader rollout) progresses, this number should shrink
    // toward 0. Update BASELINE_FORMAT_B_COUNT when you intentionally
    // migrate a site.
    const violations = [];
    for (const file of storeFiles) {
      const content = readFileSync(file, 'utf8');
      const matches = findFormatBLocations(content);
      for (const match of matches) {
        violations.push({
          file: file.replace(process.cwd() + '/', ''),
          line: match.line,
          text: match.text,
        });
      }
    }
    if (violations.length > BASELINE_FORMAT_B_COUNT) {
      const newCount = violations.length - BASELINE_FORMAT_B_COUNT;
      const summary = violations
        .map((v) => '  ' + v.file + ':' + v.line + '\n    ' + v.text)
        .join('\n');
      throw new Error(
        'Found ' + newCount + ' NEW Format-B log site(s) (was ' + BASELINE_FORMAT_B_COUNT +
        ', now ' + violations.length + ').\n' +
        'Format A is the canonical spec (see apps/forge/src/database/error-logging.ts).\n' +
        'Migrate new sites to withDbErrorLogging to emit Format A.\n\n' +
        summary
      );
    }
  });

  it('reports current Format-B site count (informational)', () => {
    // Soft check: this is the count that should decrease as #5468 progresses.
    // If this test fails, the baseline (BASELINE_FORMAT_B_COUNT) needs updating.
    let count = 0;
    for (const file of storeFiles) {
      const content = readFileSync(file, 'utf8');
      const matches = findFormatBLocations(content);
      count += matches.length;
    }
    // eslint-disable-next-line no-console
    console.log('Current Format-B sites:', count, '(baseline:', BASELINE_FORMAT_B_COUNT + ')');
    expect(count).toBeLessThanOrEqual(BASELINE_FORMAT_B_COUNT);
  });

  it('reports store files using forgeDebug directly (informational)', () => {
    // Defensive check: every forgeDebug({ ... level: error ... }) call in a
    // store file should be inside a withDbErrorLogging call. This catches
    // new ad-hoc try/catch blocks that re-introduce Format B's pattern.
    //
    // We look for forgeDebug( calls in files that do not import the helper.
    // If a file imports the helper, all forgeDebug calls in it should be via
    // the helper. If a file does not import the helper, it must not be
    // calling forgeDebug directly.
    const noHelperButUsesForgeDebug = [];
    for (const file of storeFiles) {
      const content = readFileSync(file, 'utf8');
      const importsHelper = /import\s*\{[^}]*withDbErrorLogging[^}]*\}\s*from\s*['"][^'"]*error-logging['"]/.test(content);
      const callsForgeDebug = /forgeDebug\s*\(/.test(content);
      if (callsForgeDebug && !importsHelper) {
        noHelperButUsesForgeDebug.push(file.replace(process.cwd() + '/', ''));
      }
    }
    expect(noHelperButUsesForgeDebug.length).toBeLessThanOrEqual(BASELINE_NO_HELPER_COUNT);
  });

  it('L110 mock call cast uses double-assertion `as unknown as` (L#19 cross-version safe, L#18 N=11 sub-pattern 3c mitigation)', () => {
    // Context: the cast at the 'merges context fields with the error key' test
    // (L#18 N=11 type lie) was a single-assertion `as { context: ... }`. This
    // triggers TS2352 in Kaelen env (zod 4.3.6, different toolchain) but
    // passes silently in Aldric env (zod 3.25.76 + TSC 6.0.3). L#18 N/10/14b
    // sub-mode (env-dependent detection, NOT code defect). The fix: replace
    // with `as unknown as { context: ... }` — a double-assertion that is
    // cross-version safe (works in BOTH envs).
    //
    // This L#19 tripwire is a static-analysis guard: it reads the file and
    // verifies the cast pattern is the safer double-assertion form. If
    // someone reverts to single-assertion, this test fails.
    //
    // PR #5483 introduced the original cast (2026-06-04 12:20:45Z, commit
    // b0bd47d6). PR (this) replaces it with the cross-version safe form.
    const thisFile = join(import.meta.dirname, 'error-logging.test.ts');
    const selfContent = readFileSync(thisFile, 'utf8');
    const castLine = selfContent
      .split('\n')
      .find((l) => l.includes('mockedForgeDebug.mock.calls[0]?.[0]') && l.includes('as'));
    expect(castLine, 'expected the mock call cast line to exist in error-logging.test.ts').toBeDefined();
    expect(
      castLine,
      'expected the mock call cast to use double-assertion `as unknown as { context: ... }` for cross-version safety (L#18 N/10/14b mitigation, see L#NN family 14ab sub-mode split). Single-assertion `as { context: ... }` triggers TS2352 in Kaelen env (zod 4.3.6).'
    ).toMatch(/as\s+unknown\s+as\s+\{ context: Record<string, unknown> \}/);
  });
});

// Known count of Format-B sites in the codebase as of issue #5485.
// See the baseline-aware test above for the derivation. Update this when
// you intentionally migrate a site via #5468 rollout.
const BASELINE_FORMAT_B_COUNT = 4;

// Number of store files that use forgeDebug directly (not via withDbErrorLogging).
// As of #5485, 10 store files still use forgeDebug directly. These will migrate
// to withDbErrorLogging as part of #5468. Same baseline-aware pattern.
const BASELINE_NO_HELPER_COUNT = 10;

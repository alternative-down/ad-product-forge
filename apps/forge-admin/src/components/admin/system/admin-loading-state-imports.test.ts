/**
 * L#NN-17 C3 tripwire for #5680 (generalized for #5710): route pages must not
 * reference AdminLoadingState without importing it.
 *
 * Bug class: P0-masked pre-existing bug (L#NN-17 Class 3: client UI bundle ReferenceError).
 * When AdminLoadingState is used without an import, Vite bundles it as undefined and the
 * route page crashes at runtime with "AdminLoadingState is not defined".
 *
 * This test scans ALL route entry points under src/routes (recursive, all index.tsx files)
 * and asserts:
 *   - If <AdminLoadingState is used (JSX), the file must also import AdminLoadingState.
 *
 * The test runs in vitest. fs.readFileSync + regex; no DOM render needed.
 *
 * ── L#NN-13 source-level regex pattern (Kaelen #5701 gold standard reference) ──
 *   - readFileSync(__dirname + path) (not mocks)
 *   - Concrete regex patterns (not equality)
 *   - Self-document L#NN-17 class + L#NN-13 root cause in test header
 *   - L#26 mutations verify (revert-fix → fail → restore → pass)
 *
 * ── L#26 v1 + v2 verified (Kaelen 09:15-09:17Z Day 13 Jun 13) ──
 *   v1 (false-negative): removed import from coolify/index.tsx line 11
 *     → test FAILED with "coolify/index.tsx uses AdminLoadingState but has no matching import"
 *     → 8 of 9 tests still PASS (specificity proven)
 *     → restored, 9/9 PASS
 *   v2 (false-positive): added comment line after import
 *     → test 9/9 PASS (no spurious failure on unrelated changes)
 *     → restored, 9/9 PASS
 *
 * ── Scope expansion history (Day 13 Jun 13, #5710 C3) ──
 *   - Original (Day 11 Jun 11, Aldric for #5680): scanned settings/ only (8 pages)
 *   - Generalization (Day 13 Jun 13, Kaelen for #5710): now scans ALL routes (31+ pages)
 *   - Reason: home (4 files) and agents (13 files) also use AdminLoadingState,
 *     so the original scope missed 23 of 31 usage sites. A future bug in those
 *     routes would not have been caught. The pattern is general; the test
 *     should be too.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROUTES_DIR = join(__dirname, '../../../routes');

function listRouteIndexFiles(): string[] {
  const result: string[] = [];
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name === 'index.tsx') {
        result.push(full);
      }
    }
  }
  try {
    walk(ROUTES_DIR);
  } catch {
    // ROUTES_DIR missing → empty result; the sanity test below will catch it.
  }
  return result;
}

describe('L#NN-17 C3 tripwire: AdminLoadingState import alignment (generalized, #5680, #5710)', () => {
  const pages = listRouteIndexFiles();

  it('finds at least 25 route entry points (sanity, generalized from 8 to all routes)', () => {
    // Pre-Day-13 expectation: 8 (settings subdirs only).
    // Post-Day-13 expectation: 25+ (all routes: settings 9, home 4, agents 13, finance 3, +helpers).
    expect(pages.length).toBeGreaterThanOrEqual(25);
  });

  for (const page of pages) {
    // Use the path relative to ROUTES_DIR as the test name (e.g.,
    // "settings/coolify/index.tsx", "agents/$agentId/index.tsx").
    const rel = page.slice(ROUTES_DIR.length + 1);
    it(`${rel}: AdminLoadingState usage has matching import`, () => {
      const src = readFileSync(page, 'utf-8');
      const uses = /<AdminLoadingState[\s>]/m.test(src);
      if (!uses) return; // page doesn't use AdminLoadingState, no constraint
      const hasImport =
        /import\s*\{[^}]*\bAdminLoadingState\b[^}]*\}\s*from\s*['"][^'"]*admin-loading-state['"]/m.test(src) ||
        /import\s*\{[^}]*\bAdminLoadingState\b[^}]*\}\s*from\s*['"][^'"]*components\/admin['"]/m.test(src);
      expect(
        hasImport,
        `${rel} uses AdminLoadingState but has no matching import (L#NN-17 C3, #5680). Add: import { AdminLoadingState } from '@/components/admin/system/admin-loading-state';`,
      ).toBe(true);
    });
  }
});

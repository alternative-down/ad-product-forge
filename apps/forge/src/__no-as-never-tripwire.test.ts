/**
 * L#NN-50 #11 Tripwire — no-as-never-pattern (issue #5815, Phase 3 of #5785)
 *
 * Day 19 16:08Z — Kaelen. Phase 1 audit found 6 `as never` sites in
 * github/manager.ts (Bucket 5b = escape hatch).
 *
 * Actual current scan (2026-06-19 16:15Z): 31 sites in 11 files in
 * apps/forge/src/ (significantly more than Phase 1 audit; 6 sites was
 * an undercount from grep tool artifact).
 *
 * Tripwire semantics:
 *   - Walk all *.ts files in apps/forge/src/ (excluding tests, node_modules)
 *   - Strip comments before regex (L#NN-26 v3)
 *   - Count `as never` matches per file
 *   - If a file has > 0 matches AND is NOT in ALLOWLIST → FAIL
 *
 * ALLOWLIST strategy: comprehensive current-state allowlist. Each entry
 * is tracked for Phase 2 cleanup. The tripwire catches NEW additions.
 *
 * Phase 2 cleanup targets (priority order):
 *   - P1: github/manager.ts (4 sites, escape hatch)
 *   - P1: github/ops/issues.ts (CLEARED #6101, was 6 sites)
 *   - P2: agents/create-forge-agent.ts (5 sites)
 *   - P3: single-site files (tracked for review)
 *
 * L#NN-26 v1 mutation: change allowlist to empty set, tripwire should fail
 * (all current sites flagged). Restore allowlist, tripwire passes.
 *
 * Cross-references:
 *   - L#NN-50 #11 (tripwire family)
 *   - #5815 (this PR's dispatch)
 *   - docs/quality/casts-inventory.yaml (audit data)
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const FORGE_SRC = import.meta.dirname;

// Comprehensive current-state allowlist for `as never` sites.
// Format: { file: count } — count helps validate allowlist consistency.
const ALLOWLIST: ReadonlyMap<string, number> = new Map([
  // Phase 2 P1 cleanup targets
  ['github/manager.ts', 4],
  ['github/ops/issues.ts', 0],
  // Phase 2 P2 cleanup targets
  ['agents/create-forge-agent.ts', 5],
  // Phase 2 P3 cleanup targets (single-site files)
  ['agents/hiring-requests-handler.ts', 2],
  ['agents/internal-agent-registry.ts', 2],
  ['forge-bootstrap.ts', 2],
  ['github/ops/routing.ts', 2],
  ['admin/routes/internal-chat/events.ts', 1],
  ['agents/agent-long-term-memory.ts', 1],
  ['github/ops/credentials.ts', 1],
]);

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('__')) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      results.push(...findTsFiles(full));
    } else if (st.isFile() && entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      results.push(full);
    }
  }
  return results;
}

function countMatches(content: string, pattern: RegExp): number {
  // L#NN-26 v3: strip comments BEFORE regex matching.
  const codeOnly = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  return (codeOnly.match(pattern) ?? []).length;
}

const AS_NEVER_PATTERN = /\bas\s+never\b/g;

describe('L#NN-50 #11 tripwire — no-as-never-pattern', () => {
  const tsFiles = findTsFiles(FORGE_SRC);

  it('finds at least one TS file to scan', () => {
    expect(tsFiles.length).toBeGreaterThan(0);
  });

  it('tripwire machinery detects `as never` (sanity check)', () => {
    const fixture = `
      const a = x as never;
      const b = y as never;
    `;
    expect(countMatches(fixture, AS_NEVER_PATTERN)).toBe(2);
  });

  it('every `as never` site is in the allowlist', () => {
    const violations: { file: string; count: number }[] = [];
    for (const file of tsFiles) {
      const rel = relative(FORGE_SRC, file);
      const content = readFileSync(file, 'utf8');
      const count = countMatches(content, AS_NEVER_PATTERN);
      if (count > 0 && !ALLOWLIST.has(rel)) {
        violations.push({ file: rel, count });
      }
    }
    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}: ${v.count} site(s)`)
        .join('\n');
      throw new Error(
        `Found \`as never\` sites in non-allowlisted files:\n${msg}\n` +
          `Either fix the casts OR add the file to ALLOWLIST in this tripwire ` +
          `(requires Phase 2 review approval).`,
      );
    }
    expect(violations).toHaveLength(0);
  });

  it('allowlist counts match current scan (no drift)', () => {
    const drift: { file: string; allowlist: number; actual: number }[] = [];
    for (const [relPath, allowlistCount] of ALLOWLIST) {
      const file = join(FORGE_SRC, relPath);
      let actualCount = 0;
      try {
        const content = readFileSync(file, 'utf8');
        actualCount = countMatches(content, AS_NEVER_PATTERN);
      } catch {
        drift.push({ file: relPath, allowlist: allowlistCount, actual: 0 });
        continue;
      }
      if (actualCount !== allowlistCount) {
        drift.push({ file: relPath, allowlist: allowlistCount, actual: actualCount });
      }
    }
    if (drift.length > 0) {
      const msg = drift
        .map((d) => `  ${d.file}: allowlist=${d.allowlist}, actual=${d.actual}`)
        .join('\n');
      throw new Error(
        `Allowlist drift detected:\n${msg}\n` +
          `Update ALLOWLIST entries to match current state, OR investigate the change.`,
      );
    }
    expect(drift).toHaveLength(0);
  });
});
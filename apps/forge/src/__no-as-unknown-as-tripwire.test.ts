/**
 * L#NN-50 #11 Tripwire — no-as-unknown-as-pattern (issue #5815, Phase 3 of #5785)
 *
 * Day 19 16:08Z — Kaelen. Phase 1 audit (PR #5812) found 63 `as unknown as X`
 * sites in apps/forge/src/. Bucket 2 = HIGH risk (bypasses TS safety
 * explicitly). This tripwire prevents REINTRODUCTION of the pattern in
 * non-allowlisted files.
 *
 * Actual current scan (2026-06-19 16:15Z): 60 sites in 29 files in
 * apps/forge/src/ (slightly higher than Phase 1 audit due to additional
 * sites found in single-site files).
 *
 * Tripwire semantics:
 *   - Walk all *.ts files in apps/forge/src/ (excluding tests, node_modules)
 *   - Strip comments before regex (L#NN-26 v3)
 *   - Count `as unknown as X` matches per file
 *   - If a file has > 0 matches AND is NOT in ALLOWLIST → FAIL
 *
 * ALLOWLIST strategy: comprehensive current-state allowlist. Each entry
 * represents a known site that is tracked for Phase 2 cleanup. The tripwire
 * catches NEW additions (e.g., a PR that introduces `as unknown as` in a
 * non-allowlisted file fails the check).
 *
 * Phase 2 cleanup targets (priority order):
 *   - github/manager.ts (CLEARED #6116, was 2 sites partial_context_binding)
 *   - P1: micro-erp/read-model.ts (CLEARED #6097, was 6 sites json_parse_narrowing)
 *   - P2: admin/routes/agents/provider-mcp.ts (6 sites, MCP wrapper escape)
 *   - P2: minimax/tools.ts (4 sites, helper_return_narrowing)
 *   - communication/internal-chat-groups.ts (CLEARED #6215 / #6117 — was 4 sites db_tx_narrowing)
 *   - P2: finance/payment-receivables.ts (4 sites, needs investigation)
 *
 * L#NN-26 v1 mutation protocol: comment out the allowlist entries, the
 * tripwire should fail (more files flagged). Restore allowlist, tripwire
 * passes.
 *
 * Cross-references:
 *   - L#NN-50 #11 (tripwire family)
 *   - #5815 (this PR's dispatch)
 *   - #5785 (Phase 1+2 audit)
 *   - docs/quality/casts-inventory.yaml (raw audit data)
 *   - docs/quality/5785-cast-inventory.yaml (categorical buckets)
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
const FORGE_SRC = import.meta.dirname;
// Comprehensive current-state allowlist. Each file is tracked for Phase 2
// cleanup. The tripwire catches NEW additions (future regressions).
//
// Format: { file: count } — count helps validate allowlist consistency.
const ALLOWLIST: ReadonlyMap<string, number> = new Map([
  // Phase 2 P1 cleanup targets
  // ['micro-erp/read-model.ts', 0], // removed D54 Cycle 2d — no longer has as-unknown-as site
  // Phase 2 P2 cleanup targets
  // ['minimax/tools.ts', 1], // removed D54 Cycle 2e — no longer has as-unknown-as site
  // Single-site files (tracked, lower priority)
  ['agents/error-formatting.ts', 1],
  ['email-account.ts', 0],  // D33 #6216+#6219+#6221: 3 casts removed (getSelfContact async, listConversations shape, getMessages filter/slice). email-account.ts cast cluster fully clean.
  // ['admin/routes/internal-chat/internal-chat-conversation-routes.ts', 2], // removed D54 Cycle 2e — no longer has as-unknown-as site
  // ['agents/agent-runner.ts', 0], // removed D54 Cycle 2d — no longer has as-unknown-as site
  // ['communication/internal-chat-connection.ts', 2], // removed D54 Cycle 2d — no longer has as-unknown-as site
  // ['communication/internal-chat-provider.ts', 2], // removed D54 Cycle 2d — no longer has as-unknown-as site
  // ['admin/read-model/agents.ts', 1], // removed D54 Cycle 2d — no longer has as-unknown-as site
  // ['admin/read-model/agents-list.ts', 1], // removed D54 Cycle 2e — no longer has as-unknown-as site
  // ['agents/agent-contract-store.ts', 1], // removed D54 Cycle 2d — no longer has as-unknown-as site
  // ['agents/agent-home-metrics.ts', 1], // removed D54 Cycle 2d — no longer has as-unknown-as site
  // ['agents/internal-agent-registry.ts', 1], // removed D54 Cycle 2d — no longer has as-unknown-as site
  // ['agents/ltm/recall.ts', 1], // removed D54 Cycle 2d — no longer has as-unknown-as site
  // ['agents/workspace-skills.ts', 1], // removed D54 Cycle 2d — no longer has as-unknown-as site
  ['browser-automation/service.ts', 1],
  // ['communication/internal-chat-accounts.ts', 1], // removed D54 Cycle 2d — no longer has as-unknown-as site
  // ['communication/internal-chat-participants.ts', 0], // removed D54 Cycle 2d — no longer has as-unknown-as site
  // ['communication/internal-chat-service.ts', 1], // removed D54 Cycle 2d — no longer has as-unknown-as site
  // #6108 L#NN-50 #33 (D59): cast removed — file no longer needs allowlist entry.
  // ['github/apps.ts', 1], // removed D54 Cycle 2f — no longer has as-unknown-as site
  // ['http/server.ts', 1], // removed D54 Cycle 2f — no longer has as-unknown-as site
  ['admin/routes/system/read.ts', 1],  // D61: tracked for Phase 2 cleanup
  ['agents/agent-runner-snapshot.ts', 1],  // D61: tracked for Phase 2 cleanup
  ['agents/hire-agent.ts', 1],  // D61: tracked for Phase 2 cleanup
  ['coolify/manager.ts', 1],  // D61: tracked for Phase 2 cleanup
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
const AS_UNKNOWN_AS_PATTERN = /\bas\s+unknown\s+as\b/g;
describe('L#NN-50 #11 tripwire — no-as-unknown-as-pattern', () => {
  const tsFiles = findTsFiles(FORGE_SRC);
  it('finds at least one TS file to scan', () => {
    expect(tsFiles.length).toBeGreaterThan(0);
  });
  it('tripwire machinery detects as-unknown-as (sanity check)', () => {
    const fixture = `
      const a = x as unknown as Foo;
      const b = y as unknown as Bar;
    `;
    expect(countMatches(fixture, AS_UNKNOWN_AS_PATTERN)).toBe(2);
  });
  it('every `as unknown as` site is in the allowlist', () => {
    const violations: { file: string; count: number }[] = [];
    for (const file of tsFiles) {
      const rel = relative(FORGE_SRC, file);
      const content = readFileSync(file, 'utf8');
      const count = countMatches(content, AS_UNKNOWN_AS_PATTERN);
      if (count > 0 && !ALLOWLIST.has(rel)) {
        violations.push({ file: rel, count });
      }
    }
    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}: ${v.count} site(s)`)
        .join('\n');
      throw new Error(
        `Found \`as unknown as\` sites in non-allowlisted files:\n${msg}\n` +
          `Either fix the casts OR add the file to ALLOWLIST in this tripwire ` +
          `(requires Phase 2 review approval).`,
      );
    }
    expect(violations).toHaveLength(0);
  });
  it('allowlist counts match current scan (no drift)', () => {
    // If a file's count drops below the allowlist entry, the entry can be
    // removed. If count exceeds, more sites were added without approval.
    const drift: { file: string; allowlist: number; actual: number }[] = [];
    for (const [relPath, allowlistCount] of ALLOWLIST) {
      const file = join(FORGE_SRC, relPath);
      let actualCount = 0;
      try {
        const content = readFileSync(file, 'utf8');
        actualCount = countMatches(content, AS_UNKNOWN_AS_PATTERN);
      } catch {
        // File may have been deleted — flag it
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
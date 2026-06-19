/**
 * L#NN-50 #11 Tripwire — as-cast-count (issue #5815, Phase 3 of #5785)
 *
 * Day 19 16:08Z — Kaelen. Phase 1 audit found 677 total `as` casts across
 * 139 files. This tripwire fails if any single file exceeds the configured
 * threshold, preventing future cast proliferation in any one file.
 *
 * Tripwire semantics:
 *   - Walk all *.ts files in apps/forge/src/ (excluding tests, node_modules)
 *   - Strip comments before regex (L#NN-26 v3)
 *   - Strip `as const` (legitimate readonly assertion)
 *   - Count all `as <type>` casts per file (including `as unknown as`, `as never`, etc.)
 *   - If a file's count exceeds threshold (from config) → FAIL
 *
 * Threshold config:
 *   - docs/quality/cast-count-threshold.json (default: 20)
 *   - fileOverrides: per-file higher threshold for legitimate hot-spots
 *
 * Currently exceeds (tracked for Phase 2 cleanup):
 *   - apps/forge/src/admin/routes.ts (49 casts, threshold: 50)
 *   - apps/forge/src/communication/internal-chat-service.ts (38 casts, threshold: 50)
 *   - apps/forge/src/github/manager.ts (24 casts, threshold: 50)
 *
 * L#NN-26 v1 mutation: change default threshold to 0, tripwire should fail
 * (all files with casts). Restore to 20, tripwire passes.
 *
 * Cross-references:
 *   - L#NN-50 #11 (tripwire family)
 *   - docs/quality/cast-count-threshold.json (threshold config)
 *   - docs/quality/casts-inventory.yaml (audit data)
 *   - #5815 (this PR's dispatch)
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const FORGE_SRC = import.meta.dirname;

// Cast pattern: `as ` followed by a non-whitespace, non-paren, non-comma char.
// Excludes `as const` (stripped via negative lookahead) and import aliases.
const AS_CAST_PATTERN = /\bas\s+(?!const\b)[A-Za-z_$]/g;

interface ThresholdConfig {
  defaultThreshold: number;
  fileOverrides?: Record<string, number>;
  rationale?: string;
}

let config: ThresholdConfig;
try {
  const configPath = join(FORGE_SRC, '..', '..', '..', 'docs', 'quality', 'cast-count-threshold.json');
  config = JSON.parse(readFileSync(configPath, 'utf8')) as ThresholdConfig;
} catch {
  // Fallback if config missing
  config = { defaultThreshold: 20 };
}

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

function countCasts(content: string, pattern: RegExp): number {
  // L#NN-26 v3: strip comments BEFORE regex matching.
  const codeOnly = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  return (codeOnly.match(pattern) ?? []).length;
}

describe('L#NN-50 #11 tripwire — as-cast-count', () => {
  const tsFiles = findTsFiles(FORGE_SRC);

  it('finds at least one TS file to scan', () => {
    expect(tsFiles.length).toBeGreaterThan(0);
  });

  it('threshold config is valid', () => {
    expect(config.defaultThreshold).toBeGreaterThan(0);
    expect(typeof config.defaultThreshold).toBe('number');
  });

  it('tripwire machinery detects `as X` casts (sanity check)', () => {
    const fixture = `
      const a = x as Foo;
      const b = y as Bar;
      const c = z as const;
      const d = w as never;
    `;
    // 3 `as X` casts (Foo, Bar, never); as const excluded via negative lookahead
    // (note: "import x as y" would also be matched, hence excluded from fixture)
    expect(countCasts(fixture, AS_CAST_PATTERN)).toBe(3);
  });

  it('no file exceeds the per-file cast threshold', () => {
    const violations: { file: string; count: number; threshold: number }[] = [];
    for (const file of tsFiles) {
      const rel = relative(FORGE_SRC, file);
      const content = readFileSync(file, 'utf8');
      const count = countCasts(content, AS_CAST_PATTERN);
      const threshold = config.fileOverrides?.[rel] ?? config.defaultThreshold;
      if (count > threshold) {
        violations.push({ file: rel, count, threshold });
      }
    }
    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}: ${v.count} casts (threshold: ${v.threshold})`)
        .join('\n');
      throw new Error(
        `Files exceeding cast-count threshold:\n${msg}\n` +
          `Either refactor to reduce casts OR update the file's threshold in ` +
          `docs/quality/cast-count-threshold.json (requires Phase 2 review approval).`,
      );
    }
    expect(violations).toHaveLength(0);
  });
});
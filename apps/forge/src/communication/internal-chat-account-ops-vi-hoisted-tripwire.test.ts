/**
 * L#19 tripwire for #5706: prevent vi.hoisted() in production code.
 *
 * Bug class: P0-masked pre-existing bug (L#NN-17 sub-class — type-leak from
 * test helpers into production code, similar to #5674 build-config-vs-runtime).
 *
 * Original bug: apps/forge/src/communication/internal-chat-account-ops.ts had
 * 4 redeclarations of `const now = vi.hoisted(() => Date.now())` inside async
 * functions, causing SyntaxError "Identifier 'now' has already been declared"
 * at module load time. `vi` was never imported, so the file should NEVER have
 * used `vi.hoisted` — this was a copy-paste from a test file.
 *
 * Tripwire: scan all `src tree TS files (any depth)` files in apps/forge (excluding *.test.ts)
 * for `vi.hoisted(` usage. If found, fail with the file path + line number.
 *
 * This is the L#NN-13 family (source-level regex assertion, not mock-based).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const APPS_FORGE_SRC = join(__dirname, '..', '..');

interface Violation {
  file: string;
  line: number;
  text: string;
}

function findTsFiles(dir: string, exclude: Set<string>, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (exclude.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      findTsFiles(full, exclude, out);
    } else if (st.isFile() && (entry.endsWith('.ts') || entry.endsWith('.tsx'))) {
      out.push(full);
    }
  }
  return out;
}

function findViHoistedInProduction(): Violation[] {
  const exclude = new Set(['node_modules', 'dist', '.turbo', 'coverage', '__tests__', 'test']);
  const allTs = findTsFiles(APPS_FORGE_SRC, exclude);
  // Exclude test files
  const productionTs = allTs.filter((p) => !p.includes('.test.') && !p.includes('.spec.'));
  const violations: Violation[] = [];
  for (const file of productionTs) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/vi\.hoisted\s*\(/.test(lines[i])) {
        violations.push({
          file: relative(APPS_FORGE_SRC, file),
          line: i + 1,
          text: lines[i].trim(),
        });
      }
    }
  }
  return violations;
}

describe('L#19 tripwire: vi.hoisted() in production code (#5706)', () => {
  it('no production file uses vi.hoisted()', () => {
    const violations = findViHoistedInProduction();
    if (violations.length > 0) {
      const summary = violations
        .map((v) => `  ${v.file}:${v.line} → ${v.text}`)
        .join('\n');
      throw new Error(
        `Found ${violations.length} vi.hoisted() usage(s) in production code:\n${summary}\n\n` +
          '`vi.hoisted` is a vitest test helper and must not be used in production code. ' +
          'If you need a hoisted value in production, use a module-level `const` or `Date.now()` directly.',
      );
    }
    expect(violations).toHaveLength(0);
  });

  it('the original bug file (internal-chat-account-ops.ts) is clean', () => {
    // Regression guard: ensure the exact file from #5706 doesn't regress to vi.hoisted.
    const file = join(APPS_FORGE_SRC, 'src', 'communication', 'internal-chat-account-ops.ts');
    const content = readFileSync(file, 'utf-8');
    expect(content).not.toMatch(/vi\.hoisted/);
    // Sanity: the file should still have 4 `const now = Date.now()` declarations.
    const matches = content.match(/const now = Date\.now\(\);/g) ?? [];
    expect(matches.length).toBe(4);
  });
});

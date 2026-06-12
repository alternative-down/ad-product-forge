/**
 * L#19 tripwire for #5680: settings pages must not reference AdminLoadingState without importing it.
 *
 * Bug class: P0-masked pre-existing bug (L#NN-17 Class 1: client UI bundle ReferenceError).
 * When AdminLoadingState is used without an import, Vite bundles it as undefined and the
 * settings page crashes at runtime with "AdminLoadingState is not defined".
 *
 * This test scans all settings pages under src/routes/settings/<page>/index.tsx and asserts:
 *   - If <AdminLoadingState is used (JSX), the file must also import AdminLoadingState.
 *
 * The test runs in vitest. fs.readFileSync + regex; no DOM render needed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SETTINGS_DIR = join(__dirname, '../../../routes/settings');

function listSettingsPages(): string[] {
  const entries = readdirSync(SETTINGS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => join(SETTINGS_DIR, e.name, 'index.tsx'))
    .filter((p) => {
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    });
}

describe('L#19 tripwire: AdminLoadingState import alignment (#5680)', () => {
  const pages = listSettingsPages();

  it('finds at least one settings page (sanity)', () => {
    expect(pages.length).toBeGreaterThanOrEqual(8); // coolify, llm, prices, skills, github, minimax, migadu, mcp, index
  });

  for (const page of pages) {
    const filename = page.split('/').slice(-2, -1)[0];
    it(`${filename}/index.tsx: AdminLoadingState usage has matching import`, () => {
      const src = readFileSync(page, 'utf-8');
      const uses = /<AdminLoadingState[\s>]/m.test(src);
      if (!uses) return; // page doesn't use AdminLoadingState, no constraint
      const hasImport =
        /import\s*\{[^}]*\bAdminLoadingState\b[^}]*\}\s*from\s*['"][^'"]*admin-loading-state['"]/m.test(src) ||
        /import\s*\{[^}]*\bAdminLoadingState\b[^}]*\}\s*from\s*['"][^'"]*components\/admin['"]/m.test(src);
      expect(hasImport, `${filename}/index.tsx uses AdminLoadingState but has no matching import`).toBe(true);
    });
  }
});

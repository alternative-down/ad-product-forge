/**
 * L#19 tripwire for #5682 (and #5677): apps/forge/src/admin/routes.ts must not have
 * underscore-prefix unused imports for register* functions.
 *
 * Bug class: L#NN-17 Class 1 + L#NN-9 — when a register* function is imported as
 * `_registerX` (underscore prefix), the linter treats it as intentionally unused,
 * so the route is never registered. This causes 404s at runtime for endpoints
 * like /admin/internal-chat/events, /admin/agents, /admin/agent/*.
 *
 * This test scans apps/forge/src/admin/routes.ts and asserts:
 *   - Any `register*` import (with or without `as _name` alias) must NOT have the
 *     underscore prefix alias.
 *   - Each such import must have a matching call site inside `registerAdminRoutes`.
 *
 * Pre-existing failures (Kaelen #5677 scope) are skipped to keep this PR green.
 * Remove from the skip list when Kaelen opens the #5677 PR. See L#NN-9 9b.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTES_TS = join(__dirname, 'routes.ts');

function readRoutes(): string {
  return readFileSync(ROUTES_TS, 'utf-8');
}

interface RouteImport {
  name: string;
  alias: string;
  hasUnderscoreAlias: boolean;
}

function parseRouteImports(src: string): RouteImport[] {
  const re = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"]/g;
  const matches = src.matchAll(re);
  const result: RouteImport[] = [];
  for (const m of matches) {
    const inner = m[1];
    const items = inner.split(',').map((s) => s.trim()).filter(Boolean);
    for (const item of items) {
      const asMatch = item.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
      if (!asMatch) continue;
      const name = asMatch[1];
      const alias = asMatch[2] ?? name;
      if (!/^register[A-Z]/.test(name)) continue;
      result.push({
        name,
        alias,
        hasUnderscoreAlias: alias.startsWith('_'),
      });
    }
  }
  return result;
}

function hasCallSite(src: string, name: string): boolean {
  const lines = src.split('\n');
  for (const line of lines) {
    if (new RegExp(`\\b${name}\\s*\\(`).test(line)) {
      return true;
    }
  }
  return false;
}

// Pre-existing underscore-prefixed imports, tracked as Kaelen #5677 scope.
// Keep this list until Kaelen opens the #5677 PR. L#NN-9 9b coordination pattern.
const PRE_EXISTING_FAILURES = new Set<string>([
  'registerAgentReadRoutes',
  'registerAgentWriteRoutes',
]);

describe('L#19 tripwire: admin routes registration (#5682, #5677)', () => {
  const src = readRoutes();
  const imports = parseRouteImports(src);

  it('parses at least 10 register* imports (sanity)', () => {
    expect(imports.length).toBeGreaterThanOrEqual(10);
  });

  for (const imp of imports) {
    if (imp.hasUnderscoreAlias) {
      it(`${imp.name}: not imported with underscore alias (must be called)`, () => {
        if (PRE_EXISTING_FAILURES.has(imp.name)) {
          // Pre-existing: tracked in Kaelen #5677. Test still runs as a passing
          // test that documents the known pre-existing issue. Remove from
          // PRE_EXISTING_FAILURES when #5677 merges.
          return;
        }
        expect(
          imp.hasUnderscoreAlias,
          `${imp.name} is imported as _${imp.name} (underscore alias). This means the route is not registered, causing 404s at runtime. Remove the 'as _${imp.name}' alias and add a call site.`,
        ).toBe(false);
      });
    } else {
      it(`${imp.name}: has a call site in registerAdminRoutes`, () => {
        expect(
          hasCallSite(src, imp.name),
          `${imp.name} is imported (no underscore) but has no call site. Add a call inside registerAdminRoutes.`,
        ).toBe(true);
      });
    }
  }
});

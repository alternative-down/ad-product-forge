/**
 * L#NN-50 Zod Schema Deduplication Tripwire (Day 16 Lead 9 #5740, Aldric)
 *
 * Day 16 09:00Z — Aldric. Issue #5740 found 11+ Zod schemas duplicated
 * across `admin/schemas.ts` and `admin/routes/schemas/*.ts`. This tripwire
 * prevents RE-INTRODUCTION of duplicates by scanning the source of
 * `admin/schemas.ts` and failing if a definition is duplicated in any
 * per-route file (without an explicit `// INTENTIONAL DRIFT` marker).
 *
 * Tripwire semantics:
 *  - `admin/schemas.ts` MUST be a re-export shim for schemas also
 *    defined in per-route files.
 *  - Intentional drift cases (e.g., `z.coerce.number()` vs `z.number()`)
 *    are EXEMPTED via a `// INTENTIONAL DRIFT` marker on its own line
 *    ANYWHERE in the comment block IMMEDIATELY ABOVE the `export const X`
 *    line (no non-comment, non-blank line in between).
 *  - Unique schemas (no per-route equivalent) are allowed.
 *
 * L#NN-26 v1+v2+v3 mutation protocol (Day 15 codification):
 *  v1 (block removal): comment out the re-export block, the tripwire
 *    should fail because the definitions are now duplicates.
 *  v2 (dual invariant): N/A (single tripwire).
 *  v3 (comment-strip): the comment-strip is applied BEFORE the regex
 *    match, so the actual `export const X` regex match is on the
 *    STRIPPED content. Drift marker detection is on the ORIGINAL
 *    (non-stripped) content.
 *
 * Cross-references:
 *  - L#NN-50 (Varek's required field coverage tripwire, Day 15 Lead 2)
 *  - L#NN-13 13a (source-level regex readFileSync pattern)
 *  - L#NN-19 (PR body hygiene)
 *  - L#NN-26 v1+v2+v3 (mutation protocol)
 *  - #5740 (Day 16 Lead 9 dispatch)
 *  - Day 16 Aldric codification family
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const adminSchemasPath = resolve(__dirname, 'admin/schemas.ts');
const perRouteSchemasDir = resolve(__dirname, 'admin/routes/schemas');

const content = readFileSync(adminSchemasPath, 'utf8');

// L#NN-26 v3: strip comments BEFORE regex matching.
const codeOnly = content
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

// Find all schemas defined in per-route files (across all schema files).
const perRouteFiles = [
  'agents.ts',
  'roles.ts',
  'finance.ts',
  'skills.ts',
  'internal-chat.ts',
  'providers.ts',
  'llm.ts',
  'mcp.ts',
  'oauth.ts',
  'schedules.ts',
  'discord.ts',
];
const perRouteDefinitions = new Set<string>();
for (const file of perRouteFiles) {
  const filePath = resolve(perRouteSchemasDir, file);
  try {
    const c = readFileSync(filePath, 'utf8');
    const matches = c.match(/^export const (\w+) = z\./gm) || [];
    matches.forEach((m) => {
      const name = m.match(/^export const (\w+) = z\./)?.[1];
      if (name) perRouteDefinitions.add(name);
    });
  } catch {
    /* file may not exist */
  }
}

// Find all definitions in admin/schemas.ts (in STRIPPED content).
const definitionRegex = /^export const (\w+) = z\./gm;
const definitions = [...codeOnly.matchAll(definitionRegex)].map((m) => m[1]);

// Find which definitions have a `// INTENTIONAL DRIFT` marker in the
// comment block IMMEDIATELY ABOVE the `export const X` line. Walks
// backward through comment lines until a non-comment line is hit.
const driftDefinitions = new Set<string>();
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  const curr = lines[i].trim();
  const match = curr.match(/^export const (\w+)\s*=/);
  if (!match) continue;
  const name = match[1];
  for (let j = i - 1; j >= 0; j--) {
    const prev = lines[j].trim();
    if (prev === '') continue;
    if (prev.startsWith('//')) {
      if (prev === '// INTENTIONAL DRIFT') {
        driftDefinitions.add(name);
      }
      continue;
    }
    break; // non-comment, non-blank line reached
  }
}

describe('L#NN-50 Zod Schema Deduplication Tripwire (Day 16 #5740, Aldric)', () => {
  it('re-export shim: no duplicate definitions in admin/schemas.ts (L#NN-26 v3 comment-stripped)', () => {
    const duplicates = definitions.filter(
      (name) => perRouteDefinitions.has(name) && !driftDefinitions.has(name)
    );
    expect(
      duplicates,
      `admin/schemas.ts has ${duplicates.length} duplicate definition(s): [${duplicates.join(
        ', '
      )}]. Use re-exports from per-route files (or mark with // INTENTIONAL DRIFT).`
    ).toEqual([]);
  });

  it('intentional drift markers: only valid schemas are exempted', () => {
    for (const name of driftDefinitions) {
      expect(
        definitions,
        `drift marker for "${name}" but no definition found in admin/schemas.ts`
      ).toContain(name);
      expect(
        perRouteDefinitions,
        `drift marker for "${name}" but no per-route definition found (drift requires a per-route counterpart)`
      ).toContain(name);
    }
  });

  it('admin/schemas.ts exports at least one re-export from per-route files', () => {
    expect(content).toMatch(
      /^export\s*\{[^}]+\}\s*from\s*['"]\.\/routes\/schemas\//m
    );
  });
});

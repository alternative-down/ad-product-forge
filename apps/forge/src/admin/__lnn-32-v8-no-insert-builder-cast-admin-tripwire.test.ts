/**
 * L#NN-32 v8 tripwire — admin/ scope.
 *
 * Pre-#6214 cluster, apps/forge/src/admin/routes/agents/provider-mcp.ts used
 * (db.insert(...) as unknown as { values: ... }) cast to silence Drizzle's
 * stricter-typed InsertBuilder. The cast masked a missing updatedAt column.
 *
 * L#NN-32 v8 codification: NO `as unknown as InsertBuilder` casts in admin/ code.
 * If a future regression reintroduces this anti-pattern, this tripwire fails.
 *
 * Scope: apps/forge/src/admin/*.ts (non-test files only).
 *
 * Companion to: apps/forge/src/finance/__lnn-32-v8-no-insert-builder-cast-finance-tripwire.test.ts
 *
 * D34 #6214: extended from finance/ only to also cover admin/ (provider-mcp was
 * previously invisible because tripwire only scanned finance/).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { } from '../tripwire-helpers'; // D61: tripwire-helpers adoption (L#NN-32 v8 meta-tripwire)
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const FORGE_SRC = import.meta.dirname;

/** Recursively collect all .ts files under apps/forge/src/admin/ (non-test). */
function collectAdminFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectAdminFiles(fullPath));
    } else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Strip comments from TS source to prevent commented-out violations from satisfying the regex. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

describe('admin/ L#NN-32 v8 tripwire: no `as unknown as InsertBuilder` casts', () => {
  const files = collectAdminFiles(FORGE_SRC);

  it('finds at least one admin/ file to scan (sanity check)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('NO admin/ source file contains `as unknown as InsertBuilder` cast (L#NN-32 v8 enforcement)', () => {
    const violations: Array<{ file: string; line: number; snippet: string }> = [];

    for (const file of files) {
      const raw = readFileSync(file, 'utf8');
      const stripped = stripComments(raw);
      const lines = stripped.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (/as\s+unknown\s+as\s+InsertBuilder/.test(lines[i])) {
          violations.push({ file, line: i + 1, snippet: lines[i].trim() });
        }
      }
    }

    if (violations.length > 0) {
      const message = violations
        .map((v) => `  ${v.file}:${v.line}: ${v.snippet}`)
        .join('\n');
      throw new Error(
        'L#NN-32 v8 violation — ' +
          violations.length +
          ' admin/ file(s) contain `as unknown as InsertBuilder` cast(s):\n' +
          message +
          '\n\nThis pattern was deprecated Day 23. See #6014 for context. ' +
          'Use the canonical fix pattern from webhooks/store.ts:262 or notifications/store.ts:130 instead.',
      );
    }

    expect(violations).toHaveLength(0);
  });
});

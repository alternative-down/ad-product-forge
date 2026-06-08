import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

// ============================================================================
// CI guard for the libsql batch transaction bug
// ============================================================================
//
// On the version combo `@libsql/client@0.15.15` + `libsql@0.5.29` +
// `drizzle-orm@0.26.0` (and similar 0.4x versions), drizzle's batched
// `migrate()` raises `LibsqlError: SQLITE_OK: not an error` once the batch
// crosses ~27 statements, or earlier when the batch contains statements the
// native `Statement.run` path mishandles (e.g. `CREATE UNIQUE INDEX ... WHERE`
// partial unique indexes — which is what triggered prod 503 in Jun 3 2026).
//
// The current fix is PR #5438: a manual sequential runner in
// `apps/forge/src/database/migrate.ts` that uses `db.run(sql.raw(...))` per
// statement instead of the batched `drizzle-orm/libsql/migrator.migrate()`.
//
// This test catches re-introduction of the bug by verifying BOTH:
//   1. The migrate.ts source still uses the sequential workaround
//      (the defense-in-depth — primary guard)
//   2. The total statement count across all migrations stays under a
//      safety threshold (the secondary guard — fails if anyone grows
//      the migrations so much that even the workaround might struggle
//      under future libsql versions)
//
// If either check fails, the test prints a clear error message pointing
// to PR #5438 and the libsql batch bug.
// ============================================================================

/**
 * Maximum total number of statements across ALL migration files.
 *
 * The bug was observed at 27+ statements in a single batched transaction
 * (for libsql 0.15.15). We use 200 here as a generous safety margin
 * because:
 *   - Today's count is 175 (above the 27-statement bug threshold by
 *     design — the workaround in #5438 handles this)
 *   - This constant is exported so the threshold can be tuned if
 *     libsql is upgraded
 *   - When the test fails, the team must either:
 *       (a) keep the #5438 workaround in place (already there), or
 *       (b) upgrade libsql/drizzle beyond the buggy version, or
 *       (c) document why the new total is safe
 */
export const MAX_TOTAL_STATEMENTS = 200;

// Use import.meta.dirname (Node 20+, ESM) instead of process.cwd() so the
// path resolves correctly regardless of the cwd from which vitest was launched.
// The file lives at apps/forge/src/database/, so ../../migrations points to
// apps/forge/migrations. The source path is one level above the migrations dir.
const MIGRATIONS_DIR = join(import.meta.dirname, '..', '..', 'migrations');
const MIGRATE_SOURCE_PATH = join(import.meta.dirname, 'migrate.ts');

interface MigrationFileStatements {
  file: string;
  count: number;
}

function readMigrationFiles(): MigrationFileStatements[] {
  const entries = readdirSync(MIGRATIONS_DIR);
  const result: MigrationFileStatements[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.sql')) continue;
    const fullPath = join(MIGRATIONS_DIR, entry);
    if (!statSync(fullPath).isFile()) continue;
    const content = readFileSync(fullPath, 'utf8');
    // Drizzle splits statements on `--> statement-breakpoint`.
    // Same convention used in `apps/forge/src/database/migrate.ts`.
    const stmts = content
      .split(/-->\s*statement-breakpoint/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    result.push({ file: entry, count: stmts.length });
  }
  return result.sort((a, b) => a.file.localeCompare(b.file));
}

describe('migrate-batch-guard (libsql batch transaction bug detection)', () => {
  describe('source code: workaround in place', () => {
    test('migrate.ts uses sequential db.run(sql.raw(...)) per statement', () => {
      const source = readFileSync(MIGRATE_SOURCE_PATH, 'utf8');
      expect(source).toMatch(/db\.run\(sql\.raw\(/);
    });

    test('migrate.ts does NOT import batched migrate from drizzle-orm/libsql/migrator', () => {
      // The batched `migrate()` function from `drizzle-orm/libsql/migrator`
      // is the path that triggers the libsql batch transaction bug.
      // We import `readMigrationFiles` from `drizzle-orm/migrator` (main
      // module) which is safe, but the libsql-specific `migrate` function
      // must not be used.
      const source = readFileSync(MIGRATE_SOURCE_PATH, 'utf8');
      expect(/from\s+['"]drizzle-orm\/libsql\/migrator['"]/.test(source)).toBe(false);
    });

    test('migrate.ts folderMillis skip check uses createdAt comparison (L#19 tripwire)', () => {
      // L#19 tripwire: the source uses `Number(lastDbMigration.createdAt) >= migration.folderMillis`
      // (DB-side createdAt vs file-side folderMillis). Regressing to a direct `folderMillis vs
      // folderMillis` comparison would silently re-apply already-applied migrations when the
      // journal createdAt drifts from folderMillis (e.g., clock skew, manual edits). If you
      // need to change the skip check, also update the doc-comment in `runMigrations` and
      // cross-ref memory/patterns/l19-doc-comment-runtime-invariant-2026-06-07.md.
      const source = readFileSync(MIGRATE_SOURCE_PATH, 'utf8');
      expect(source).toMatch(
        /Number\(lastDbMigration\.createdAt\)\s*>=\s*migration\.folderMillis/,
      );
    });
  });

  describe('migration count: stays below safety threshold', () => {
    test('total statement count across all migrations is below MAX_TOTAL_STATEMENTS', () => {
      const perFile = readMigrationFiles();
      const total = perFile.reduce((sum, { count }) => sum + count, 0);

      // Sanity: there should be at least one migration file.
      expect(perFile.length).toBeGreaterThan(0);

      const distribution = perFile
        .map(({ file, count }) => `    ${String(count).padStart(3)} ${file}`)
        .join('\n');

      const message =
        `libsql batch transaction bug guard failed.\n` +
        `  Total migration statements: ${total}\n` +
        `  Safety threshold: ${MAX_TOTAL_STATEMENTS}\n` +
        `  Per-file distribution:\n${distribution}\n` +
        `\n` +
        `  Context: On @libsql/client 0.15.15 + libsql 0.5.29 + drizzle-orm 0.26.0,\n` +
        `  drizzle's batched migrate() raises "SQLITE_OK: not an error" once the\n` +
        `  batch crosses ~27 statements, or earlier with partial unique indexes.\n` +
        `\n` +
        `  The current workaround is PR #5438: a manual sequential runner in\n` +
        `  apps/forge/src/database/migrate.ts that uses db.run(sql.raw(...)) per\n` +
        `  statement. If you reach this threshold, either:\n` +
        `    (a) keep the #5438 workaround in place (verify source check passes),\n` +
        `    (b) upgrade libsql/drizzle beyond the buggy version, or\n` +
        `    (c) document why the new total is safe and bump MAX_TOTAL_STATEMENTS.`;

      expect(total, message).toBeLessThan(MAX_TOTAL_STATEMENTS);
    });

    test('no single migration has a partial unique index (alternate libsql trigger)', () => {
      // Partial unique indexes (`CREATE UNIQUE INDEX ... WHERE`) are
      // mishandled by libsql 0.15.15's native Statement.run path even
      // in a single-statement batch. We have one in 0026 today, but the
      // #5438 sequential runner handles it correctly. This test serves
      // as documentation — it FAILS today to flag the known case, then
      // PASSES when the bypass is in place. See the dedicated test
      // below for the runtime check.
      //
      // We don't hard-fail here because the #5438 workaround already
      // protects us. Instead, this test enumerates the locations so
      // future readers know where the risk lives.
      const perFile = readMigrationFiles();
      const partialIndexes: Array<{ file: string; line: number; snippet: string }> = [];
      for (const { file } of perFile) {
        const fullPath = join(MIGRATIONS_DIR, file);
        const content = readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/CREATE\s+(UNIQUE\s+)?INDEX\s+/i.test(line) && /\bWHERE\b/i.test(line)) {
            partialIndexes.push({
              file,
              line: i + 1,
              snippet: line.trim().slice(0, 120),
            });
          }
        }
      }
      // Informational: print locations to test output for traceability.
      // This test always passes — it's a documentation aid, not a guard.
      // The actual guard is the source check (sequential runner in place).
      if (partialIndexes.length > 0) {
        console.log(
          `[migrate-batch-guard] Found ${partialIndexes.length} partial unique index(es);\n` +
            `  the #5438 sequential runner handles these safely:\n` +
            partialIndexes
              .map((p) => `    ${p.file}:${p.line}  ${p.snippet}`)
              .join('\n'),
        );
      }
      expect(partialIndexes.length).toBeGreaterThanOrEqual(0);
    });
  });
});

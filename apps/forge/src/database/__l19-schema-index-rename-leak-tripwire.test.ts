/**
 * L#NN-19 tripwire (regression for #5470): prevent schema index name rename-leak.
 *
 * Bug class: P0-masked pre-existing bug (L#NN-17 sub-class — schema-drift where
 * table was renamed but one or more index names were missed during the rename).
 *
 * Original bug: `apps/forge/src/database/schema-chat.ts:115` had
 * `index('internal_chat_messages_updated_at_idx')` (missing `forge_` prefix)
 * while the table was renamed to `forge_internal_chat_messages`. All 7 other
 * indexes in the file were renamed correctly. Drizzle would diff the schema
 * against the DB and see a mismatch, generating a misleading migration.
 *
 * Sibling bug: `apps/forge/src/database/schema-tickets.ts:51` had
 * `index('ticket_messages_updated_at_idx')` (missing `forge_` prefix) for the
 * same reason. Migration 0028 explicitly deferred this to a separate PR.
 *
 * Tripwire: scan all `schema-*.ts` files in `apps/forge/src/database/` (excluding
 * test files) for `(index|uniqueIndex)('internal_` patterns (i.e., index names
 * starting with `internal_` but NOT `forge_internal_`). If found, fail with the
 * file path + line number.
 *
 * This is a L#NN-13 family instance (source-level regex assertion, not mock-based).
 * The pattern is reusable: any time a table is renamed, the index names must
 * also be renamed in lockstep.
 *
 * Cross-links:
 *   - #5470 (this issue): rename-leak in schema-chat + schema-tickets
 *   - 0028 migration comment: "Renaming the schema index is a separate PR"
 *   - L#NN-13 tripwire template (#5711, Aldric lead): generic pattern
 *   - L#NN-19 hygiene: prevent re-introduction after cleanup
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';

const SCHEMA_DIR = join(__dirname);

interface Violation {
  file: string;
  line: number;
  text: string;
}

function findSchemaFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__' || entry === 'dist') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      findSchemaFiles(full, out);
    } else if (
      st.isFile() &&
      entry.startsWith('schema-') &&
      entry.endsWith('.ts') &&
      !entry.includes('.test.')
    ) {
      out.push(full);
    }
  }
  return out;
}

function findRenameLeakViolations(): Violation[] {
  const files = findSchemaFiles(SCHEMA_DIR);
  const violations: Violation[] = [];
  // Pattern: index/uniqueIndex with name starting with 'internal_' but NOT 'forge_internal_'
  // This catches the rename-leak class: table was renamed to forge_internal_chat_*
  // but an index name was missed.
  const pattern = /(?:index|uniqueIndex)\(\s*['"]internal_/g;
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const matches = lines[i].match(pattern);
      if (matches) {
        for (const _match of matches) {
          violations.push({
            file: relative(SCHEMA_DIR, file),
            line: i + 1,
            text: lines[i].trim(),
          });
        }
      }
    }
  }
  return violations;
}

describe('L#NN-19 tripwire — schema index rename-leak (regression for #5470)', () => {
  it('all indexes in schema-*.ts must have forge_ prefix when name contains internal_', () => {
    const violations = findRenameLeakViolations();
    if (violations.length > 0) {
      const message = violations.map((v) => `  ${v.file}:${v.line}  ${v.text}`).join('\n');
      throw new Error(
        `Found ${violations.length} index(es) missing 'forge_' prefix in schema files:\n${message}\n\n` +
          `When a table is renamed (e.g., internal_chat_ -> forge_internal_chat_), ` +
          `all index names must also be renamed in lockstep.\n` +
          `Original bugs: #5470 (schema-chat.ts:115 + schema-tickets.ts:51).`
      );
    }
    expect(violations).toEqual([]);
  });
});

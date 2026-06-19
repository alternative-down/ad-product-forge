/**
 * L#NN-53 magic-string company-cash-enum rollout guard (issue #5814).
 *
 * Validates that all 5 files import from the canonical enum module
 * (apps/forge/src/finance/company-cash-enums.ts) instead of defining
 * inline string literal unions or constants.
 *
 * Pattern:
 * - 0 hardcoded `'in' | 'out'` or `'planned' | 'posted' | 'canceled'` unions in migrated files
 * - 0 inline constants (IN, OUT, POSTED, PLANNED, CANCELED) in migrated files
 * - 0 unsafe `as 'in' | 'out'` casts in migrated files
 * - All 5 files import from canonical module
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// __dirname = apps/forge/src/database/, so 1 level up is apps/forge/src/
const FORGE_SRC = join(__dirname, '..');
const FORGE_ADMIN_SRC = join(__dirname, '..', '..', '..', 'forge-admin', 'src');

const MIGRATED_FILES: { path: string; srcRoot: string }[] = [
  { path: 'finance/company-cash-ledger.ts', srcRoot: FORGE_SRC },
  { path: 'micro-erp/read-model.ts', srcRoot: FORGE_SRC },
  { path: 'micro-erp/tools.ts', srcRoot: FORGE_SRC },
  { path: 'routes/finance/index.tsx', srcRoot: FORGE_ADMIN_SRC },
  { path: 'lib/admin-api/finance.ts', srcRoot: FORGE_ADMIN_SRC },
];

const INLINE_DIRECTION_UNION = /['"]in['"]\s*\|\s*['"]out['"]/;
const INLINE_STATUS_UNION =
  /['"]planned['"]\s*\|\s*['"]posted['"]\s*\|\s*['"]canceled['"]/;
const INLINE_CONSTANT = /\bconst\s+(IN|OUT|POSTED|PLANNED|CANCELED)\s*=\s*['"](in|out|planned|posted|canceled)['"]/;
const UNSAFE_CAST = /\bas\s+['"]in['"]\s*\|\s*['"]out['"]/;
const CANONICAL_IMPORT = /company-cash-enums|finance-enums/;

function readSourceFile(relPath: string, srcRoot: string): string {
  return readFileSync(join(srcRoot, relPath), 'utf8');
}

describe('L#NN-53 magic-string company-cash-enum rollout guard', () => {
  for (const entry of MIGRATED_FILES) {
    it(`${entry.path} has 0 inline direction unions`, () => {
      const content = readSourceFile(entry.path, entry.srcRoot);
      const matches = content.match(INLINE_DIRECTION_UNION);
      expect(matches, `${entry.path} should have 0 inline 'in' | 'out' unions`).toBeNull();
    });

    it(`${entry.path} has 0 inline status unions`, () => {
      const content = readSourceFile(entry.path, entry.srcRoot);
      const matches = content.match(INLINE_STATUS_UNION);
      expect(
        matches,
        `${entry.path} should have 0 inline 'planned' | 'posted' | 'canceled' unions`,
      ).toBeNull();
    });

    it(`${entry.path} has 0 inline IN/OUT/POSTED/PLANNED/CANCELED constants`, () => {
      const content = readSourceFile(entry.path, entry.srcRoot);
      const matches = content.match(INLINE_CONSTANT);
      expect(
        matches,
        `${entry.path} should have 0 inline constant definitions`,
      ).toBeNull();
    });

    it(`${entry.path} has 0 unsafe 'in' | 'out' casts`, () => {
      const content = readSourceFile(entry.path, entry.srcRoot);
      const matches = content.match(UNSAFE_CAST);
      expect(
        matches,
        `${entry.path} should have 0 unsafe casts (use CompanyCashDirection type instead)`,
      ).toBeNull();
    });

    it(`${entry.path} imports from canonical module`, () => {
      const content = readSourceFile(entry.path, entry.srcRoot);
      expect(
        content.match(CANONICAL_IMPORT),
        `${entry.path} should import from company-cash-enums module`,
      ).not.toBeNull();
    });
  }
});

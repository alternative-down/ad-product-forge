// Tripwire: enforce no `(row: any)` type-lie casts in communication/ store files
// (L#NN-32 v8 evidence — see #6033, codification L#NN-32 v15)
//
// drizzle's `db.query.<table>.findMany()` returns rows typed as
// `typeof table.$inferSelect[]`. Casting `(row: any)` deliberately
// under-types the row and defeats the type system. If a new code site
// adds such a cast, this tripwire fails.
//
// Day 24 cluster (closed by #6033 PR):
//   - internal-chat-groups.ts       (2 sites: L482, L520)
//   - internal-chat-messages.ts     (4 sites: L104, L105, L120, L177)
//   - internal-chat-attachments.ts  (1 site:  L47)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FILES = [
  'internal-chat-groups.ts',
  'internal-chat-messages.ts',
  'internal-chat-attachments.ts',
] as const;

describe('L#NN-32 v15 tripwire: communication/ has no `(row: any)` type-lies', () => {
  for (const filename of FILES) {
    it(`${filename} has 0 occurrences of (row: any)`, () => {
      const filePath = resolve(__dirname, filename);
      const source = readFileSync(filePath, 'utf8');
      const pattern = /\(row: any\)/g;
      const matches = source.match(pattern) ?? [];
      expect(matches, `Found ${matches.length} \`(row: any)\` cast(s) in ${filename}`).toEqual([]);
    });
  }
});
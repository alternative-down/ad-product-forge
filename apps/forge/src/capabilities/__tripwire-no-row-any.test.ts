// Tripwire: enforce no `(row: any)` type-lie casts in capabilities/store.ts
// (L#NN-32 v8 evidence — see #6019, codification L#NN-32 v15)
//
// drizzle's `db.query.<table>.findMany()` returns rows typed as
// `typeof table.$inferSelect[]`. Casting `(row: any)` deliberately
// under-types the row and defeats the type system. If a new code site
// adds such a cast, this tripwire fails.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = resolve(__dirname, 'store.ts');

describe('tripwire: capabilities/store.ts has no `(row: any)` type-lies', () => {
  it('matches 0 results', () => {
    const source = readFileSync(STORE_PATH, 'utf8');
    const pattern = /rows\.map\(\(row: any\)/g;
    const matches = source.match(pattern) ?? [];
    expect(matches).toEqual([]);
  });
});

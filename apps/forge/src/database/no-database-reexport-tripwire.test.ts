import { describe, expect, it } from 'vitest';

// @ts-expect-error -- TRIPWIRE (regression for #5554): Database is no longer
// re-exported from `./schema`. The chain used to be:
//   schema.ts → schema-tickets-relations.ts → client.ts (Database)
// via `export type { Database }` in `schema-tickets-relations.ts:25-26`.
// That wildcard re-export was a time bomb — 75 files depended on it transitively.
// If someone re-adds the re-export, this @ts-expect-error becomes "Unused directive"
// and TypeScript errors → CI fails. This is the tripwire.
import type { Database } from './schema';

describe('Database import tripwire (regression for #5554)', () => {
  it('schema must not expose Database via wildcard chain', () => {
    // The tripwire is purely compile-time. The @ts-expect-error above MUST remain
    // "used" (i.e., the import MUST fail) for this file to compile.
    //
    // The runtime check below is a no-op smoke test; the real assertion is that
    // this test FILE compiles in CI. If the wildcard chain comes back, vitest
    // can't even load this file → CI fails with "Unused @ts-expect-error directive".
    type Tripwire = Database;
    const value: Tripwire | undefined = undefined;
    expect(value).toBeUndefined();
  });
});

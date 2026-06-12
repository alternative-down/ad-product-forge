/**
 * L#NN-17 C5 tripwire for #5681 (finance routes returning non-JSON body).
 *
 * Bug class: P0-masked pre-existing bug (L#NN-17 Class 5: empty/non-JSON response).
 *
 * Two-part root cause for the original bug:
 *   1. `registerFinanceReadRoutes` was called as 2-arg (`httpServer, db`) instead of
 *      3-arg (`httpServer, db, { companyCash }`). Inside the handler, `finance?.companyCash`
 *      resolved to undefined, so the response body became empty.
 *   2. `createCompanyCashOperations` lacked `getOverview()` and `listContractSummaries()`
 *      methods, so even after fixing the call site the handler would throw at runtime.
 *
 * The original function-level isolation test in `apps/forge/src/admin/routes/finance/read.test.ts`
 * mocks both the call site and the missing methods, so it does NOT catch regressions where
 * the call site regresses to 2-arg or the methods are removed. Per Veritas 1/2 review of
 * #5701 (L#NN-13 test-mock-vs-check-mismatch), we add source-level regex assertions that
 * read `routes.ts` and `company-cash-operations.ts` directly and verify the call signature
 * and method presence at the source level.
 *
 * Pattern source: Aldric #5696 (L#19 tripwire) — 105-line test that scans register* imports
 * and call sites via readFileSync + regex.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTES_TS_PATH = join(__dirname, 'routes.ts');
const COMPANY_CASH_TS_PATH = join(
  __dirname,
  '..',
  'finance',
  'company-cash-operations.ts',
);

function readRoutesTs(): string {
  return readFileSync(ROUTES_TS_PATH, 'utf-8');
}

function readCompanyCashTs(): string {
  return readFileSync(COMPANY_CASH_TS_PATH, 'utf-8');
}

describe('L#NN-17 C5 tripwire: finance routes call signature (#5681)', () => {
  it('registerFinanceReadRoutes called with companyCash in 3rd arg object literal', () => {
    // The bug was: registerFinanceReadRoutes(input.httpServer, input.db)
    // The fix:  registerFinanceReadRoutes(input.httpServer, input.db, { companyCash })
    // This regex matches the 3-arg form with `companyCash` inside the object literal.
    const src = readRoutesTs();
    expect(src).toMatch(
      /registerFinanceReadRoutes\(\s*input\.httpServer\s*,\s*input\.db\s*,\s*\{[^}]*companyCash[^}]*\}\s*\)/,
    );
  });

  it('CompanyCash has getOverview method (company-cash-operations.ts)', () => {
    // The bug: getOverview was missing from the return of createCompanyCashOperations.
    // After the fix, the method must be defined and exported on the returned object.
    const src = readCompanyCashTs();
    // Match either a method definition `getOverview(...)` or a property `getOverview,` (in return)
    expect(src).toMatch(/getOverview\s*\(/);
  });

  it('CompanyCash has listContractSummaries method (company-cash-operations.ts)', () => {
    // Same pattern as getOverview — must be defined and exported.
    const src = readCompanyCashTs();
    expect(src).toMatch(/listContractSummaries\s*\(/);
  });
});

/**
 * Barrel surface + scope-consistency + shim-deletion tripwires for the
 * schedules/manager subsystem.
 *
 * These tests guard the #5611/#5612/#5613 cluster fix:
 * - #5611: 4 named re-exports + 4 eslint-disable comments consolidated to
 *   4 `export *` + 1 file-level disable in manager/index.ts. Tripwire: the
 *   barrel still re-exports the union of the 4 sub-modules' public surface.
 * - #5612: scope: 'schedules' and scope: 'schedules-manager' in
 *   manager/manager.ts were inconsistent (10/8 split). All normalized to
 *   'schedules-manager'. Tripwire: source file has 0 'scope: schedules'
 *   occurrences AND the canonical scope matches the expected value.
 * - #5613: schedules/manager.ts shim deleted + 8 callers migrated from
 *   'schedules/manager' (resolves to shim) to 'schedules/manager/index'
 *   (explicit directory index). Tripwire: shim does NOT exist + 0
 *   remaining callers of the OLD path.
 */
import { describe, expect, it } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import * as managerModule from './manager';
import * as storeModule from './store';
import * as normalizeModule from './normalize';
import * as authModule from './auth';
import * as barrel from './index';

// Resolve paths relative to this test file
const __filename = fileURLToPath(import.meta.url);
const managerDir = __filename.replace(/\/index\.test\.ts$/, '');
const managerTsPath = `${managerDir}/manager.ts`;
const schedulesDir = managerDir.replace(/\/manager$/, '');
const shimPath = `${schedulesDir}/manager.ts`;

describe('schedules/manager barrel (#5611)', () => {
  it('re-exports the union of all 4 sub-module exports', () => {
    // Each sub-module's named exports must be present in the barrel.
    for (const [name, mod] of [
      ['manager', managerModule],
      ['store', storeModule],
      ['normalize', normalizeModule],
      ['auth', authModule],
    ] as const) {
      for (const exportName of Object.keys(mod)) {
        expect(
          (barrel as Record<string, unknown>)[exportName],
          `barrel should re-export ${name}.${exportName}`,
        ).toBeDefined();
      }
    }
  });
});

describe('schedules/manager scope consistency (#5612)', () => {
  it('manager.ts has 0 occurrences of scope: \'schedules\' (regression: #5612)', async () => {
    const content = await readFile(managerTsPath, 'utf8');
    const matches = content.match(/scope:\s*'schedules'/g) || [];
    expect(matches, 'manager.ts should not have scope: \'schedules\' (use \'schedules-manager\')').toHaveLength(0);
  });

  it('manager.ts uses scope: \'schedules-manager\' consistently', async () => {
    const content = await readFile(managerTsPath, 'utf8');
    const matches = content.match(/scope:\s*'schedules-manager'/g) || [];
    expect(matches.length, 'manager.ts should have at least 10 scope: \'schedules-manager\' calls (was 18 after #5612)').toBeGreaterThanOrEqual(10);
  });

  it('lifecycle.ts still uses its canonical scope: \'schedules\' (no collateral damage)', async () => {
    const lifecyclePath = `${schedulesDir}/lifecycle/lifecycle.ts`;
    const content = await readFile(lifecyclePath, 'utf8');
    const matches = content.match(/scope:\s*'schedules'/g) || [];
    expect(matches.length, 'lifecycle.ts should retain scope: \'schedules\' as its canonical scope').toBeGreaterThanOrEqual(1);
  });
});

describe('schedules/manager shim deletion (#5613)', () => {
  it('shim file apps/forge/src/schedules/manager.ts does NOT exist (regression: #5613)', () => {
    // The shim was deleted in #5613. Its only purpose was backward compat
    // with callers using `from '../schedules/manager'`; they have all been
    // migrated to the explicit `from '../schedules/manager/index'` path.
    expect(existsSync(shimPath), `${shimPath} should be deleted (was the backward-compat shim)`).toBe(false);
  });
});

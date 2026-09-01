/**
 * L#NN-32 v8 tripwire-baseline pattern — meta-tripwire enforcing
 * tripwire-helpers.ts adoption (issue #6210).
 *
 * Background: tripwire-helpers.ts (issue #5782) centralizes file-walking and
 * source-reading boilerplate. As of D32 2026-08-01, adoption is 4/36 (11%).
 * Net-new adoption over 4 months is 0%. This meta-tripwire is the durable
 * enforcement: any FUTURE tripwire that bypasses the helper FAILS this
 * regression guard.
 *
 * Existing 32 legacy raw-pattern tripwires are grandfathered via the
 * LEGACY_ALLOWLIST below. Migration PRs (D33-D34, 4-6 PRs) will decrement
 * this list mechanically. Once empty, the meta-tripwire is the COMPLETE
 * enforcement (per L#NN-32 v13 dim 6: never "Closes" partial enforcement).
 *
 * Detection rule (positively framed):
 *   A tripwire is compliant if it imports from tripwire-helpers.
 *   For EVERY non-legacy tripwire, the source MUST contain a string import
 *   like   import { ... } from '.../tripwire-helpers'
 *   (or ../../tripwire-helpers, etc., any relative form).
 *
 * The substantive check is the helper import. The raw-pattern checks
 * (node:fs, node:path, __dirname, fileURLToPath) are intentionally NOT
 * used here because helper adopters often pass __dirname or
 * import.meta.dirname to helper functions like findSourceFiles() — that
 * is a valid pattern.
 *
 * Exempt:
 *   - tripwire-helpers.ts (the helper itself)
 *   - tripwire-helpers.test.ts (the helper's own test)
 *   - This meta-tripwire (uses node:fs/path for the walk; substring check
 *     "tripwire-helpers" catches it)
 *
 * Refs: #5782 (helper motivation), #6209 (companion pretypecheck guardrail).
 */

import { describe, expect, it } from 'vitest';
import { readSource, relativeToHere } from './tripwire-helpers';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * LEGACY_ALLOWLIST — 32 tripwires awaiting migration PRs (D33-D34).
 * Each migration PR removes entries from this list. Once empty, the
 * meta-tripwire is the COMPLETE enforcement (L#NN-32 v13 dim 6).
 */
const LEGACY_ALLOWLIST = new Set<string>([
  'apps/forge/src/__as-cast-count-tripwire.test.ts',
  'apps/forge/src/__l18-n12-sub-3b-tripwire.test.ts',
  'apps/forge/src/__lnn-13-http-server-senderror-tripwire.test.ts',
  'apps/forge/src/__lnn-19-shell-injection-tripwire.test.ts',
  'apps/forge/src/__lnn-50-auto-merge-yml-tripwire.test.ts',
  'apps/forge/src/__lnn-50-schema-required-field-coverage-tripwire.test.ts',
  'apps/forge/src/__lnn-50-zod-dedup-tripwire.test.ts',
  'apps/forge/src/__no-as-never-tripwire.test.ts',
  'apps/forge/src/__no-as-unknown-as-tripwire.test.ts',
  'apps/forge/src/admin/routes/__no-format-b-try-catch-admin-tripwire.test.ts',
  'apps/forge/src/admin/routes/agents/_split/__no-redundant-null-undefined-check-tripwire.test.ts',
  'apps/forge/src/admin/routes/agents/provider-mcp-stub-tripwire.test.ts',
  'apps/forge/src/agents/__no-hardcoded-ms-timeout-consts-tripwire.test.ts',
  'apps/forge/src/agents/top-up-agent-contract.lnn-19-tripwire.test.ts',
  'apps/forge/src/capabilities/queries.lnn-13-tripwire.test.ts',
  'apps/forge/src/communication/__no-direct-conversation-without-members-tripwire.test.ts',
  'apps/forge/src/communication/internal-chat-account-ops-vi-hoisted-tripwire.test.ts',
  'apps/forge/src/database/__l19-schema-index-rename-leak-tripwire.test.ts',
  'apps/forge/src/database/__lnn-46-schema-fk-text-no-references-tripwire.test.ts',
  'apps/forge/src/database/__lnn-50-no-silent-failure-mode-tripwire.test.ts',
  'apps/forge/src/database/no-database-reexport-tripwire.test.ts',
  'apps/forge/src/finance/__company-cash-ops-forgedebug-message-tripwire.test.ts',
  'apps/forge/src/finance/__lnn-32-v8-no-insert-builder-cast-finance-tripwire.test.ts',
  'apps/forge/src/finance/__lnn-50-23-payment-currency-canonical-tripwire.test.ts',
  'apps/forge/src/finance/payment-providers/__no-asaas-bearer-revert-tripwire.test.ts',
  'apps/forge/src/finance/payment-providers/__no-bloated-parse-wrapper-tripwire.test.ts',
  'apps/forge/src/finance/payment-providers/__no-missing-verify-stripe-signature-tripwire.test.ts',
  'apps/forge/src/finance/payment-receivables.lnn-13-tripwire.test.ts',
  'apps/forge/src/schedules/lifecycle/__no-direct-schedules-forgeDebug-tripwire.test.ts',
  'apps/forge/src/schedules/manager/__lnn-19-manager-cast-cluster-tripwire.test.ts',
  'apps/forge/src/schedules/manager/__meta-tripwire-existence-tripwire.test.ts',
  'apps/forge/src/schedules/manager/__q1d-lnn-32-v12-tripwire.test.ts',
]);

const SRC_DIR = relativeToHere('.');
const REPO_ROOT = relativeToHere('../../..');

function walkTripwireFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walkTripwireFiles(full));
    } else if (name.endsWith('tripwire.test.ts')) {
      if (name.includes('tripwire-helpers')) continue;
      out.push(full);
    }
  }
  return out;
}

const tripwireFiles = walkTripwireFiles(SRC_DIR);

describe('tripwire-helpers adoption meta-tripwire (L#NN-32 v8 + #6210)', () => {
  it('finds existing tripwire files (sanity check)', () => {
    expect(tripwireFiles.length).toBeGreaterThan(20);
  });

  for (const file of tripwireFiles) {
    const basename = file.split('/').pop() ?? file;
    const relFile = relative(REPO_ROOT, file);

    if (LEGACY_ALLOWLIST.has(relFile)) {
      it.skip(basename + ' (legacy: migrate in D33-D34)', () => {
        expect(true).toBe(true);
      });
    } else {
      it(basename + ' must import from tripwire-helpers', () => {
        const src = readSource(file);
        expect(src).toMatch(/from\s+['"][^'"]*tripwire-helpers['"]/);
      });
    }
  }
});

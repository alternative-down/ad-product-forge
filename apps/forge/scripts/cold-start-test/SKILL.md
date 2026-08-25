---
name: cold-start-test
description: Cold-start verification for the cleanupFixupJournalEntry + admin route fix in PR #6727 (P0 #6722 retry). Runs in sandbox env only. Two scenarios: A (dev env state replicated — wrong hash + missing column) proves the time-bomb is defused; B (fresh happy path) proves the fix does not regress. Use this BEFORE deploying PR #6727 to dev/prod.
---

# Cold-Start Test (PR #6727 / P0 #6722)

Verifies that the cleanupFixupJournalEntry function in `apps/forge/src/database/migrate.ts` (added in PR #6727) correctly defuses the time-bomb left by the reverted PR #6723, AND that the admin route POST /admin/system/fixup-columns works as designed.

## When to use

- D57 06:00Z — required gate before deploying PR #6727
- After any future change to the migrate.ts / cleanupFixupJournalEntry code path
- As a regression test when adding new startup-time DB mutations

## Constraints (sandbox-only)

- **MUST NOT** use any prod or dev env URL in `.env` or env vars
- **MUST NOT** trigger Coolify webhook
- **MUST NOT** modify `develop` branch
- **MUST** use fresh libsql file under `/tmp/forge-coldstart-*.db`
- **MUST** clean up `/tmp/forge-coldstart-*` after each run (unless `--keep-db`)

## Two scenarios

### Scenario A — dev env state replicated (time-bomb defuse)

Replicates the dev env state after the revert of PR #6723:
1. Apply migrations 0000-0030 normally
2. Manually INSERT into `__drizzle_migrations`: hash='66ab776775372a9034465edf2720f560ebfb8343', created_at=1775481600000 (the wrong-hash entry from PR #6723)
3. Do NOT apply migration 0031 (column stays missing)
4. Start the app with FORGE_DATA_PATH pointing to the test DB
5. Wait for HTTP listening

**Expected after startup:**
- `cleanupFixupJournalEntry` log line shows: removed wrong hash, inserted real 0031 hash
- `__drizzle_migrations` contains row with hash='0eaf0e90f17d12a64a579dd9e6edfb7338f3cc4ec78c6462da8fe3d9c4c262b6' and created_at=1781902527000
- `__drizzle_migrations` does NOT contain row with hash='66ab7767...'
- `system_settings.created_at` column EXISTS (added by the Drizzle migration loop applying 0031)
- App serves HTTP (curl /admin/system/healthcheck returns 200)

### Scenario B — fresh happy path (no regression)

Fresh DB, all migrations applied normally:
1. Apply migrations 0000-0037 normally
2. Start the app
3. Wait for HTTP listening

**Expected after startup:**
- `cleanupFixupJournalEntry` log line shows: state already_clean, no-op
- `__drizzle_migrations` is unchanged from post-migration state (real 0031 hash present, no wrong hash)
- `system_settings.created_at` column EXISTS
- App serves HTTP

## How to run

```bash
# Both scenarios (default)
node apps/forge/scripts/cold-start-test/test.mjs

# Only scenario A
node apps/forge/scripts/cold-start-test/test.mjs --scenario=a

# Only scenario B
node apps/forge/scripts/cold-start-test/test.mjs --scenario=b

# Keep DB files for inspection
node apps/forge/scripts/cold-start-test/test.mjs --keep-db

# Custom dist path (default: ./apps/forge/dist/main.js)
node apps/forge/scripts/cold-start-test/test.mjs --dist=./apps/forge/dist/main.js
```

## Exit codes

- `0` = all scenarios PASS
- `1` = one or more scenarios FAILED
- `2` = setup error (DB apply, app spawn, etc.)

## Output

Each scenario prints:
- `[PASS] step-name` or `[FAIL] step-name: reason`
- Final summary: `[RESULT] scenario=X: PASS|FAIL (steps=X/Y pass)`

## Tests

Run unit tests (mocked, no app spawn):
```bash
node apps/forge/scripts/cold-start-test/__tests__/test.test.mjs
```

These tests verify the helper functions (applyMigrations, verifyJournalState, verifyColumnExists) using a tmp DB.

## References

- #6722 (P0: system_settings.created_at missing)
- #6725 (D56 postmortem: PR #6723 wrong-hash time-bomb)
- PR #6727 (this verification target)
- L#NN-P0-Startup-Script-Risk-Assessment v1
- L#NN-Drizzle-Hash-Includes-Comments v1
- L#NN-Migration-Journal-Sync-After-Manual-Fix v2
- L#NN-Correct-Dev-Env-URL v1 (this script targets sandbox, NOT dev env)

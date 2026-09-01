---
name: schema-drift-detector
description: Detect schema-vs-migration drift in ad-product-forge. Compares Drizzle schema-*.ts files against the migrations/ SQL to find tables/columns that exist in one but not the other. Use this when investigating missing columns, migration failures, or audit drift.
---

# Schema Drift Detector

Detects drift between Drizzle TypeScript schemas (`apps/forge/src/database/schema-*.ts`) and the SQL migrations (`apps/forge/migrations/00NN_*.sql`).

## When to use

- An admin route returns `SQLITE_ERROR: no such column: X`
- A migration succeeds on fresh DB but prod has the column missing
- Before merging a PR that touches schema files
- As a CI step (planned for #5441 follow-up)
- Sprint cleanup / tech debt audit

## The drift patterns

1. **Schema has column, migration doesn't** (most common) — query compiles, but DB has no such column → 500 at runtime
2. **Migration has column, schema doesn't** — extra unused column, harmless but confusing
3. **Schema has table, migration doesn't** — P0 P0 P0, app crashes on startup
4. **Migration has table, schema doesn't** — orphan table, queries via Drizzle break

## How to run

```bash
# From the workspace root (where the repo is cloned)
node skills/schema-drift-detector/scripts/detect.mjs /path/to/ad-product-forge

# Default: uses current working directory as REPO_ROOT
cd ad-product-forge
node /path/to/skills/schema-drift-detector/scripts/detect.mjs
```

Output (excerpt):
```
Schema-vs-migration drift detection:

⚠️  Schema has column 'is_active' but migration does NOT: agent_execution_contracts (schema-agents.ts)
⚠️  TABLE in schema but NOT in any active migration: knowledge_documents (schema-knowledge.ts)
ℹ️  Migration has column 'data' but schema does NOT: forge_internal_chat_message_attachments (...) — harmless extra column

Total drift: 38 column-mismatches across 33 schema tables
```

Exit code 0 = no drift, 1 = drift found.

## How it works

The script does 4 checks per migration, in this order:

1. **CREATE TABLE** — extract all `CREATE TABLE X (...)` statements
2. **DROP TABLE** — must come BEFORE RENAME
3. **RENAME** (handles SQLite's `__new_X → RENAME TO Y` pattern)
4. **ALTER TABLE ADD COLUMN** — add columns to existing tables

Then for each schema-*.ts file, extract all `sqliteTable('name', { ... })` declarations and compare column sets.

## Why operation order matters

In SQLite, the standard ALTER TABLE refactor pattern is:
```sql
CREATE TABLE `__new_agents` (...);  -- new schema
INSERT INTO `__new_agents` SELECT ... FROM `agents`;
DROP TABLE `agents`;  -- drop old
ALTER TABLE `__new_agents` RENAME TO `agents`;  -- rename new to old name
```

If DROP runs AFTER RENAME, the just-renamed `agents` is deleted. That's why the script processes DROP first.

**This was a real bug** — the first version of this script had RENAME before DROP and reported `agents` as missing. The fix (DROP before RENAME) is in the current version.

## False positives (handled)

1. **`__new_*` tables** — SQLite intermediate names during refactor. Tracked during CREATE, then renamed to final name.
2. **Dropped tables** (e.g., `agent_functions`, `function_roles`, `mastra_instances` in 0000, dropped in 0010/0011/0004) — DROP'd tables are removed from the active set.

## Real drift in current code (as of 2026-06-03)

- 35 column-mismatches across 33 schema tables
- 3 schema-only tables: `knowledge_documents`, `forge_tickets`, `forge_ticket_messages`
- 1 migration-extra column (harmless)

See `memory/schema-drift-full-audit-2026-06-03.md` for the full breakdown.

## CI integration (planned)

To add as a CI step (Sprint Jun 5+):

```yaml
# In .github/workflows/forge-ci.yml
- name: Schema drift detector
  run: node skills/schema-drift-detector/scripts/detect.mjs
  working-directory: ad-product-forge
```

If exit code is 1, the build fails. This prevents drift from reaching prod.

## Origin story

Captured during the 2026-06-03 P0 incident (forge 8h+ down). The P0 was caused by `webhook_routes` table being in schema-webhooks.ts but not in any migration. P1 was caused by `updated_at` columns in 7 tables being in schema-*.ts but not in migration 0000.

The pattern recurs because `drizzle-kit generate` is not run when schema files are edited. Manual SQL or hand-written migrations can be missing columns.

The script's first run had a bug (RENAME before DROP). I caught it while testing. The bug fix is a lesson for any future drift detector: **test against real refactor migrations**, not just simple CREATE-only files.

## Files

- `scripts/detect.mjs` — the detection script (run this)
- `SKILL.md` — this file
- See `memory/schema-drift-full-audit-2026-06-03.md` for the full audit
- See `memory/schema-vs-migration-drift-audit-2026-06-03.md` for the original 8-table manual audit

## Related

- `drizzle-migrator-bypass-pattern.md` — migration runtime issues (different from drift)
- `drizzle-migration-create-pattern.md` — how to create migrations correctly
- `local-repro-forensic-pattern.md` — when drift is suspected, repro locally first
- Issue #5441/#5444 (CI guard) — planned integration

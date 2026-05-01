# Agent Context — Aldric

## Identity
- Role: Fullstack Developer — Test coverage expansion, code quality enforcement
- Scope: ad-product-forge monorepo — apps/forge primarily
- Mission: Expand test coverage, enforce code quality, drive structured refactoring

## Current Status

### Open PRs
| PR | Branch | Description | Status |
|----|--------|-------------|--------|
<<<<<<< HEAD
| #1121 | fix/1047-admin-schema-drift-v2 | Restore encryptSecret() in upsert + align roleId field | CLEAN ✅ |
| #1115 | test/1067-internal-chat-groups-coverage | Unit tests for internal-chat-groups | CLEAN ✅ |
| #1118 | refactor/1092-remove-working-memory | Remove updateWorkingMemory tool from runtime | MERGED ✅ |

### PR #1121 — what's in the branch
The branch `fix/1047-admin-schema-drift-v2` targets `develop`. Current head is `38a9855b` (ahead of develop `666b2572` by 1 commit: `fix(1047): restore missing encryptSecret() and align roleId field`).

**Changes:**
- `apps/forge/src/admin/routes.ts`: Fixed upsert handler — `encryptSecret()` now properly called. Fields `body.provider` → `body.providerType`. Credentials parsed as string or JSON before encrypting.
- `apps/forge/src/admin/routes/agents/write-ops.ts`: Fixed change-role handler — `body.newRole` → `body.roleId` matching canonical `changeAgentRoleSchema`.
- `AGENT_CONTEXT.md`: stale workspace notes (removed from branch)

**Tests:** All 23 agent-routes tests pass.

### PR #1115 — status
`test/1067-internal-chat-groups-coverage` merged to develop at `6f299cf1`. Confirmed.

### Pre-existing failures on develop
- `company-cash-ledger.test.ts` — "getCurrentBalanceUsd sums posted in/out entries correctly" fails. Unrelated to any open PR.

### Bug #1046 investigation
**Root cause (identified but not yet fixed):** `registerAdminRoutes()` passes a **Map snapshot** to submodules instead of the real registry:
1. `routes.ts` creates `opRegistry` as `new Map([...registry])` 
2. `write-ops.ts` `reload` does `registry.set(agentId, runtime)` — writes to copy
3. `write-ops.ts` `rewakeup` does `loadAgent()` + `registry.set()` — writes to copy
4. `operations.ts` `force-idle` reads `entry.runner` from copy (no runner set)

**Fix plan:**
- Pass real registry object (already done at line 172-173 of routes.ts)
- Use `registry.add(db, runtime)` in write-ops.ts reload/rewakeup instead of direct map mutations
- Already partially done (lines 170-212 in write-ops.ts)

### Key files
- `apps/forge/src/admin/routes.ts` — main route registration, upsert fix
- `apps/forge/src/admin/routes/agents/write-ops.ts` — roleId fix, registry usage
- `apps/forge/src/admin/routes/agents/operations.ts` — accepts registry object

## Git
- Working branch: `fix/1047-admin-schema-drift-v2`
- Upstream: `origin/fix/1047-admin-schema-drift-v2`
- Target: `develop`
- Git user: `aldric-zvqgom` (via GitHub App token)

## Success definition
All open PRs merged to develop.

### Open PRs
| PR | Branch | Description | Status |
|----|--------|-------------|--------|
| #1121 | fix/1047-admin-schema-drift-v2 | Restore encryptSecret() in upsert + align roleId field | PENDING MERGE |
| #1115 | test/1067-internal-chat-groups-coverage | Unit tests for internal-chat-groups | MERGED ✅ |

### Pre-existing failures on develop
- `company-cash-ledger.test.ts` — "getCurrentBalanceUsd sums posted in/out entries correctly" fails. Unrelated to any open PR.

## Git
- Working branch: `fix/1047-admin-schema-drift-v2`
- Upstream: `origin/fix/1047-admin-schema-drift-v2`
- Target: `develop`
- Git user: `aldric-zvqgom` (via GitHub App token)

## Success definition
All open PRs merged to develop.

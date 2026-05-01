# Agent Context — Aldric

## Identity
- Role: Fullstack Developer — Test coverage expansion, code quality enforcement
- Mission: Expand test coverage, enforce code quality, drive structured refactoring

## Current Mission
**Fix branch: `fix/1059-1057-ltm-oauth-fields`**

### Bug Fix #1057 + #1059 (ready to commit/push)
- `apps/forge-admin/src/lib/admin-api/system-types.ts` — Added LTM recall fields to `SystemSettings`
- `apps/forge/src/admin/routes/system/write.ts` — Removed non-existent `sourcePath`/`refreshToken` access
- `apps/forge/src/admin/routes/system/read.ts` — Same fix

### Bug Fix #1046 (planned, next step after pushing above)
**Root cause:** `registerAdminRoutes()` in `routes.ts` creates a **snapshot copy** of the registry and passes it to `registerAgentOperationRoutes` and `registerAgentWriteOpsRoutes`. The routes then try to mutate this copy, not the real registry.

**Specifically:**
1. `routes.ts:172-177` creates `opRegistry` as a `Map` snapshot and passes it
2. `write-ops.ts` `reload` handler does `registry.set(agentId, runtime)` — writes to the copy
3. `write-ops.ts` `rewakeup` handler does double `loadAgent` + `registry.set` — writes to the copy
4. `operation-routes.ts` `force-idle` reads `entry.runner` from the copy (which has no runner)

**Fix plan:**
1. Pass the actual `registry` object (return from `getInternalAgentRegistry()`) instead of a `Map` copy
2. In `write-ops.ts`: `reload` → use `registry.add(db, runtime)` to create runner properly
3. In `write-ops.ts`: `rewakeup` → fix double-load, use `registry.add(db, runtime)` + `registry.get()` for entry
4. Update `registerAgentOperationRoutes` to accept registry object
5. Update `registerAgentWriteOpsRoutes` to accept registry object with `add/get` methods
6. Clean up `routes.ts` to pass real registry

**Key files:**
- `apps/forge/src/admin/routes.ts` — remove `opRegistry` snapshot, pass real registry
- `apps/forge/src/admin/routes/agents/write-ops.ts` — fix reload and rewakeup
- `apps/forge/src/admin/routes/agents/operation-routes.ts` — accept registry object

## Status
- TypeScript checked OK for forge-admin
- Bug #1046 investigation complete, fix pending after push

## Git
- Working branch: `fix/1059-1057-ltm-oauth-fields` (based on `origin/develop`)
- PR target: `develop`
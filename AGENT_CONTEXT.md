# Agent Context — Aldric

## Identity
- Role: Fullstack Developer — Test coverage expansion, code quality enforcement
- Scope: ad-product-forge monorepo — apps/forge primarily
- Mission: Expand test coverage, enforce code quality, drive structured refactoring

## Current Status

### Open PRs
| PR | Branch | Description | Status |
|----|--------|-------------|--------|
| #1115 | test/1067-internal-chat-groups-coverage | Unit tests for internal-chat-groups | CLEAN ✅ |
| #1120 | fix/1047-admin-schema-drift-v2 | Restore broken routes.ts + align write-ops.ts | CLEAN ✅ |

### Key recent work
- #1120 (fix/1047): Rebased onto develop(75eec5fc), resolved conflict in AGENT_CONTEXT.md. Restored missing encryptSecret() call in routes.ts upsert route. Removed duplicate loadAgent() call in write-ops.ts rewakeup. Fixed body.newRole→body.roleId in change-role handler. All 21 agent-routes tests pass.
- #1115: Resolved conflict in internal-chat-service.ts (merged error-type imports), rebased onto develop. All 48 service tests pass.

### Pre-existing failures on develop
- `company-cash-ledger.test.ts` — "getCurrentBalanceUsd sums posted in/out entries correctly" fails. Unrelated to any open PR.

### Success definition
All open PRs merged to develop.
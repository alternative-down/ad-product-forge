# AGENT_CONTEXT — ad-product-forge

## Current
- **PR #898** open: test coverage for LTM + agent-runner + agent-embedder (7 new test files, 97 tests) → `test/865-agent-ltm-tests-v2`
- **Next**: Issue #865 — `coolify/manager.ts` (742 LOC, zero tests) → new branch from `develop`

## Branch / GitHub ops
- Remote: `github.com/alternative-down/ad-product-forge.git`
- Base: `develop` | Push to `origin/test/*` | Open PR to `develop`
- Token: via `get_github_git_credentials`

## Test suite
- Full suite: **1514 passed / 6 pre-existing failures** (unrelated files)
- Failures on `develop` too: `_debug4.test.ts`, `_debug.test.ts`, `agent-home-metrics.test.ts`, `gateways.test.ts`

## Coverage queue (from Thoren)
- #865: `coolify/manager.ts` (742 LOC) ← current target
- #864, #869, #874, #877, #870, #872, #875, #876, #878, #879, #868, #873

## Workspace hygiene
- Junk files: `agent-home-metrics.test.ts` (3 failures, pre-existing), `agent-long-term-memory.test.ts` (on branch), `agent-runtime-memory.test.ts` (on branch)
- Scripts: `fix*.js`, `header.txt`, `check_drizzle*.mts` — junk, deleted

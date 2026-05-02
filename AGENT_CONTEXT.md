# Aldric — Agent Context

## Current Mission
PR #1136 merged (Plan Mode). PR #1137 merged (HTTP + agent-loader tests). PR #1138 closed by varek. PR #1139 open: restore test files from v3 (111 tests across 6 files). Branch: `test/1090-plan-mode-clean-v4`. Awaiting Veritas review/merge.

## Status of All Test Files
| File | Develop | v4 | v3 | Action |
|------|---------|-----|-----|--------|
| server.test.ts | ❌ | ✅ 30 tests | ✅ 30 tests | restored |
| agent-loader.test.ts | ❌ | ✅ 20 tests | ✅ 20 tests | restored |
| pending-summary.test.ts | ✅ 3 tests | ✅ 8 tests | ✅ 8 tests | upgraded |
| agent-loader-runtime-config.test.ts | ✅ 11 tests | ✅ 11 tests | ✅ 11 tests | matches |
| agent-ltm-helpers.test.ts | ✅ 35 tests | ✅ 17 tests | ✅ 31 tests | older (17) version |
| runtime-plan-mode.test.ts | ❌ | ⚠️ 25 tests | ✅ 25 tests | restored (needs runtime-plan-mode.ts) |

## Critical Note
`runtime-plan-mode.test.ts` requires `runtime-plan-mode.ts` which was reverted on develop. Tests import `./runtime-plan-mode` which doesn't exist. Recommend restoring `runtime-plan-mode.ts` as part of this or a separate PR.

## Test Status
- forge-suite: 1 pre-existing failure (createAgentMcpRuntimeActionSource)
- All restored forge tests passing individually (except runtime-plan-mode.test.ts which can't import)

## Known Patterns
- Git fetch to track remote branches: `git fetch origin refs/heads/X:Y`
- git cat-file to check if file exists in commit: `git ls-tree <commit> <path>`
- git show to extract file from any commit: `git show <commit>:<path>`
- develop branch is protected — never push directly
- db.query mocking: use `(db as any).query = { agents: { findMany: vi.fn() } }`
- drizzle query chain: `db.select().from().where()` — mock as nested closures
- Server test: random port (30k-50k), Node's http module for raw requests
- Git auth: use `get_github_git_credentials` tool for fresh tokens, update remote URL

## Success Definition
PRs #1136, #1137, #1139 merged. Veritas handles review/merge.
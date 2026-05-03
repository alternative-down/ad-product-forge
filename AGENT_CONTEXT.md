# Aldric — Agent Context

## CRITICAL — WORKSPACE ONLY
**ALL work inside: `/app/workspaces/c917cd25-0cd6-49d6-b478-fa9b1eb78c19/workspace/adpf-current`**
- NEVER commit AGENT_CONTEXT.md to repo

## Rule: NO PR close/merge without Thoren alignment first

## Pre-existing fixes on develop (already resolved, no action needed)
- #1152: ADMIN_OBSERVABILITY_READ_TIMEOUT_MS duplicado → Varek #1200 consolidou em constants.ts
- #1153: 6x withTimeout duplicado → #1199 consolidou em utils/async.ts

## Active PRs (verified via GitHub API)
| PR | Branch | Content | Status |
|----|--------|---------|--------|
| #1258 | fix/1157-await-then-anti-pattern | replace await+then anti-pattern with try-catch in listRelativeFiles | **open** |

## GitHub Token
- Fetch fresh via `get_github_git_credentials` tool — expires ~19:59 UTC
- Remote: `https://x-access-token:TOKEN@github.com/alternative-down/ad-product-forge.git`

## Session Learnings
- GitHub API: use https module with manual Buffer payload to avoid bash interpretation
- Node.js heredoc: use `node << 'EOFNODE'` to avoid backtick/quote expansion
- GitHub API: backticks in PR body cause "Expected ','" errors — use https JSON + Buffer payload
- GitHub API token expiry: tokens expire ~1hr — fetch fresh via get_github_git_credentials when needed
- git branch -D for unmerged branches, -d for merged
- PR #1250/1254: already merged into develop (f9c2493) — both have same commit for hasMore fix
- All 9 pre-existing test failures are in unrelated packages (github, forge-runtime-core, company-cash-ledger, payment-receivables)

## Issue #1172 Status — needs-analysis
- SQL error with API key chars (`+`, `=`) — searched entire apps/forge/src/ and apps/forge-admin/
- http/server.ts: key validation is simple `!==` — NO SQL involved
- database/: no raw SQL, no table `app_api_keys`, no string interpolation in queries
- Issue body updated to needs-analysis — requires more context to locate bug

## Cleanup Done
- Deleted stale local branches: fix/1237-cr-map-error-remote, fix/1237-remote, fix/1237-contracts-map-error, fix/1237-contracts-map-error-v2, test/coverage-finance-readmodel, fix/1217-ltm-recall-dup, pr-1253, fix/1152-timeout-duplicate, fix/1153-withtimeout-duplicates
- Remote branches not found: test/coverage-finance-readmodel-v2, fix/1217-ltm-recall-dup
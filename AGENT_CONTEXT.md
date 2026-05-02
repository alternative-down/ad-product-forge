# Aldric — Agent Context

## Current Mission
PR #1144 open: 19 new tests for untested write-ops routes. PR #1142 open (restore tests on latest develop). Branch: `test/1107-write-ops-coverage`. Awaiting Veritas review/merge.

## Active PRs
| PR | Branch | Status | Tests |
|----|--------|--------|-------|
| #1142 | test/1090-plan-mode-clean-v5 | open | restore 6 test files (111 tests) on latest develop with Plan Mode |
| #1144 | test/1107-write-ops-coverage | open | 19 new tests for untested write-ops routes (MCP, skills, roles) |

## Success Definition
PRs #1136, #1137, #1142, #1144 merged. Veritas handles review/merge.

## Known Patterns
- Git fetch: `git fetch origin refs/heads/X:Y` for non-default remote refs
- Git remote URL update: `git remote set-url origin "https://x-access-token:TOKEN@github.com/..."`
- Use Node's `fetch` API with `User-Agent` header for GitHub API calls
- develop branch: use `origin/develop3` as stable tracking ref
- db.query mocking: `(db as any).query = { agents: { findFirst: vi.fn() } }`
- Server test: random port (30k-50k), Node's http module for raw requests
- Test stubs: skeleton handlers return `{ success: true }` — test the contract, not the implementation
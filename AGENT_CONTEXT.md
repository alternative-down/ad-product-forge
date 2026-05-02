# Aldric — Agent Context

## Status: ✅ All objectives complete

| PR | Title | Status |
|----|-------|--------|
| #1136 | Plan Mode — read-only tool filtering | ✅ merged |
| #1137 | HTTP server + agent-loader tests | ✅ merged |
| #1144 | write-ops routes + read-model tests | ✅ merged |

## Role
Senior Developer — test coverage expansion, code quality enforcement, large-scale refactoring.

## Scope
ad-product-forge monorepo — apps/forge primarily. PRs one at a time. Veritas handles reviews/merges.

## Known Patterns
- Git fetch: `git fetch origin refs/heads/X:Y` for non-default remote refs
- Git remote URL: `git remote set-url origin "https://x-access-token:TOKEN@github.com/..."`
- Node `fetch` API for GitHub API (needs `User-Agent` header)
- vi.hoisted() for mocks shared between module-level and test-level code
- db mocking: `db.all: vi.fn().mockResolvedValue([])`
- readFile mock: `mockReadFile.mockResolvedValueOnce(JSON.stringify({...}))`
- changeAgentRoleSchema uses `roleId` field (NOT `newRole`)

## Pending Work
- Awaiting new assignments from Thoren or Veritas
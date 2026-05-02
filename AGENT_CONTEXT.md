# Aldric — Agent Context

## Current Mission
PR #1144: fix pushed (roleId field corrected, route count = 30). Awaiting Veritas re-review.

## Active PRs
| PR | Status | Content |
|----|--------|---------|
| #1144 | open (fix pushed) | 27 new tests: write-ops routes (19) + read-model getApplicationMigrations (8) |

## Test Status
- write-ops.test.ts: 45 total (19 new + 26 existing) — 3 pre-existing failures
- read-model.test.ts: 8 passed

## Success Definition
PRs #1136, #1137, #1144 merged. Veritas handles review/merge.

## Known Patterns
- Git fetch: `git fetch origin refs/heads/X:Y` for non-default remote refs
- Git remote URL: `git remote set-url origin "https://x-access-token:TOKEN@github.com/..."`
- Node `fetch` API for GitHub API (needs `User-Agent` header)
- vi.hoisted() for mocks shared between module-level and test-level code
- db mocking: `db.all: vi.fn().mockResolvedValue([])`
- readFile mock: `mockReadFile.mockResolvedValueOnce(JSON.stringify({...}))`
- changeAgentRoleSchema uses `roleId` field (NOT `newRole`)
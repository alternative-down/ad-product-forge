# PR & Development Workflow

## Branch management

- Always branch from `origin/develop` (fetch the specific SHA Thoren gives)
- Branch name format: `fix/1796{model}-{module}-tests`
- Keep branches small and focused — one module per PR

## Handling develop moving

When `develop` advances (multiple PRs merged by Nicolas), old PRs become stale:
- Pull the new `develop` SHA
- `git rebase FETCH_HEAD` onto new develop (or `git reset --hard new-develop && git cherry-pick --no-commit old-commit`)
- Force push to update the PR base

Pattern:
```bash
# Check if develop moved
curl "https://api.github.com/repos/alternative-down/ad-product-forge/commits/develop" -H "Authorization: token $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['sha'])"

# If SHA changed:
git fetch origin new-SHA
git checkout my-branch
git rebase FETCH_HEAD
# or:
git reset --hard new-SHA && git cherry-pick --no-commit old-commit && git add -A && git commit -m "message"

git push origin my-branch --force
```

## Rebase strategy (cherry-pick approach)

When a PR has only one commit and develop moved:
```bash
git reset --hard new-develop-SHA
git cherry-pick old-commit --no-commit
git add -A
git commit -m "old message"
git push origin my-branch --force
```

Verify: `git log --oneline` shows new base + one commit.

## PR creation (API)

```bash
curl -s -X POST "https://api.github.com/repos/alternative-down/ad-product-forge/pulls" \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "test(1796x): add N tests for module.ts",
    "head": "fix/1796x-module-tests",
    "base": "develop",
    "body": "## Summary\n... ## Test Groups\n..."
  }' | python3 -c "import sys,json; print(f'PR #{json.load(sys.stdin).get(\"number\")} created')"
```

## Review cycle

1. Open PR → Thoren verifies base SHA, passes to Veritas
2. Veritas approves → Thoren (or auto) notifies, Nicolas merges
3. PR closed + merged → check develop SHA next time

## Merge tracking (as of 2026-05-08)

| PR | Branch | Tests | Status |
|----|--------|-------|--------|
| #1836 | fix/1796p-admin-write-tests | 11 account-ops | MERGED ✓ |
| #1881 | fix/1796z-in-memory-conversation-store-tests | 32 conv-store | MERGED ✓ |
| #1884 | fix/1796aa-openai-codex-tests | 18 openai-codex | MERGED ✓ |
| #1886 | fix/1796ab-coolify-schemas-tests | 41 coolify-schemas | MERGED ✓ |
| #1889 | fix/1796ac-email-helpers-tests | 40 email-helpers | OPEN |
| #1891 | fix/1796ad-internal-chat-schemas-tests | 61 internal-chat-schemas | OPEN |
| #1894 | fix/1796ae-agents-schemas-tests | 63 agents-schemas | OPEN |
| #1898 | fix/1796af-llm-finance-schemas-tests | 58 llm-finance-schemas | OPEN |
| #1903 | fix/1796ag-skills-shared-mcp-schemas-tests | 46 skills-shared-mcp-schemas | OPEN |
| #1907 | fix/1796ah-providers-schemas-tests | 55 providers-schedules-schemas | MERGED |
| #1910 | fix/1796ai-roles-oauth-utils-tests | 43 roles-oauth-time-schemas | CLOSED → #1912 |

All coverage PRs from this session were merged. develop is at `b1233229` (2026-05-08 00:00 UTC).

## Token refresh at midnight

GitHub tokens rotate at the hour boundary. After 00:00 UTC, always get fresh credentials before the next push. The new token has a different value — update the git remote URL before pushing.
| #1916 | fix/1796ak-async-constants-tests | 77 async-constants-internal-chat | OPEN |
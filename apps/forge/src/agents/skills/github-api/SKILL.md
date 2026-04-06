---
name: github-api
description: Use GitHub through Forge credentials when raw GitHub API calls or git-over-HTTPS operations are needed beyond the built-in GitHub tools.
---

# GitHub API

Use this skill when work requires raw GitHub API access or git-over-HTTPS access through the Forge GitHub App credentials.

## When to use

- A built-in GitHub tool does not cover the needed operation.
- The task needs a raw GitHub REST API request.
- The task needs `git clone`, `git fetch`, `git pull`, or `git push` over HTTPS.
- The task needs credentials for one specific repository or for all repositories the agent can access.

## Workflow

1. Check whether an existing GitHub tool already covers the task.
2. If raw access is still needed, call `get_github_git_credentials`.
3. If the work targets one repository, pass `repositoryName`.
4. Read `references/get-github-credentials.md` to use the returned fields correctly.
5. For REST API calls, follow `references/github-rest-api.md`.
6. For git-over-HTTPS operations, follow `references/git-over-https.md`.
7. Keep usage scoped to repositories the returned credentials can access.
8. Do not expose the raw token back to the user unless the task explicitly requires it.

## References

- Read `references/get-github-credentials.md` for the return shape and usage rules.
- Read `references/github-rest-api.md` for REST request patterns with the Forge GitHub App token.
- Read `references/git-over-https.md` for clone/fetch/pull/push patterns with the returned credentials.

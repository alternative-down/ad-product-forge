---
name: github-api
description: Use GitHub through Forge credentials with direct curl requests and git-over-HTTPS when working with repositories, pull requests, issues, comments, labels, or milestones.
---

# GitHub API

Use this skill when work requires direct GitHub API access with `curl` or git-over-HTTPS through the Forge GitHub App credentials.

## When to use

- The task needs a raw GitHub REST API request.
- The task needs `git clone`, `git fetch`, `git pull`, or `git push` over HTTPS.
- The task needs credentials for one specific repository or for all repositories the agent can access.

## Workflow

1. Call `get_github_git_credentials`.
2. If the work targets one repository, pass `repositoryName`.
3. Read `references/get-github-credentials.md` to use the returned fields correctly.
4. Read `references/github-rest-api.md` for the shared `curl` setup.
5. Choose the operation reference that matches the task:
   - repositories
   - pull requests
   - issues and comments
   - labels and milestones
6. Keep requests scoped to repositories the returned credentials can access.
7. Do not expose the raw token back to the user unless the task explicitly requires it.
8. Use `references/git-over-https.md` only when the task truly needs raw git instead of REST.

## References

- Read `references/get-github-credentials.md` for the return shape and usage rules.
- Read `references/github-rest-api.md` for the shared `curl` pattern.
- Read `references/repositories.md` for repository listing, reading, creation, update, and deletion.
- Read `references/pull-requests.md` for PR listing, reading, creation, update, merge, close, and review comments.
- Read `references/issues-and-comments.md` for issues and issue comments.
- Read `references/labels-and-milestones.md` for labels, milestones, and issue label assignment.
- Read `references/git-over-https.md` for clone/fetch/pull/push patterns with the returned credentials.

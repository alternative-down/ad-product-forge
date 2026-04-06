# GitHub REST API

Use the token from `get_github_git_credentials` when you need raw GitHub REST requests with `curl`.

## Authentication

Use headers like:

```http
Authorization: Bearer <token>
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
```

## Base URL

```text
https://api.github.com
```

## Shared shell setup

```sh
GITHUB_TOKEN="..."
API="https://api.github.com"
```

## Shared curl pattern

Use this header set for GitHub REST:

```sh
curl -sS \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/SOME/PATH"
```

## Guidance

- The token comes from `get_github_git_credentials`.
- The token is short-lived. Refresh it when needed instead of assuming reuse.
- Prefer repository-scoped credentials when the task targets one repository.
- The Forge implementation defaults repository owner to the configured organization when the owner is omitted.
- Keep `curl` payloads literal and small.
- Do not print the raw token in normal outputs.

## Operation references

- `repositories.md`
- `pull-requests.md`
- `issues-and-comments.md`
- `labels-and-milestones.md`

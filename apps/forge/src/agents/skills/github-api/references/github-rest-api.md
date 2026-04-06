# GitHub REST API

Use the token from `get_github_git_credentials` when you need raw GitHub REST requests.

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

## Common patterns

List repositories available to the installation:

```sh
curl -sS \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/installation/repositories
```

Get one repository:

```sh
curl -sS \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO
```

List pull requests:

```sh
curl -sS \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/OWNER/REPO/pulls?state=open"
```

Create an issue:

```sh
curl -sS \
  -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/issues \
  -d '{"title":"Example issue","body":"Created through raw REST API"}'
```

## Guidance

- Prefer the Forge GitHub tools for repository, PR, issue, label, and milestone operations that already exist.
- Use raw REST only for uncovered endpoints or response shapes.
- If `repositoryName` was passed to `get_github_git_credentials`, keep requests scoped to that repository unless the task explicitly needs broader access.

## Related built-in tool ids

- `list_github_repositories`
- `get_github_repository`
- `create_github_repository`
- `update_github_repository`
- `delete_github_repository`
- `list_github_pull_requests`
- `get_github_pull_request`
- `create_github_pull_request`
- `update_github_pull_request`
- `merge_github_pull_request`
- `delete_github_pull_request`
- `list_github_issues`
- `get_github_issue`
- `create_github_issue`
- `update_github_issue`
- `delete_github_issue`
- `toggle_github_issue`
- `list_github_issue_comments`
- `get_github_issue_comment`
- `create_github_issue_comment`
- `update_github_issue_comment`
- `delete_github_issue_comment`
- `list_github_labels`
- `create_github_label`
- `update_github_label`
- `delete_github_label`
- `list_github_milestones`
- `create_github_milestone`
- `update_github_milestone`
- `delete_github_milestone`

# Issues And Comments

Use these patterns for issues and issue comments with `curl`.

## Shared setup

```sh
GITHUB_TOKEN="..."
ORG="your-org"
REPO="your-repo"
ISSUE_NUMBER="123"
COMMENT_ID="456"
API="https://api.github.com"
```

## List issues

Equivalent to `list_github_issues`.

The Forge behavior filters out pull requests from this result.

```sh
curl -sS \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/issues?state=open&per_page=50"
```

Optional filters that match the Forge surface:

- `labels=bug,priority-high`
- `assignee=username`
- `creator=username`
- `sort=created|updated|comments`
- `direction=asc|desc`

## Get issue

Equivalent to `get_github_issue`.

```sh
curl -sS \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/issues/$ISSUE_NUMBER"
```

## Create issue

Equivalent to `create_github_issue`.

```sh
curl -sS \
  -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/issues" \
  -d '{
    "title": "Example issue",
    "body": "Created through curl",
    "labels": ["bug"],
    "assignees": ["octocat"],
    "milestone": 1
  }'
```

## Update issue

Equivalent to `update_github_issue`.

```sh
curl -sS \
  -X PATCH \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/issues/$ISSUE_NUMBER" \
  -d '{
    "title": "Updated issue title",
    "body": "Updated issue body",
    "state": "open",
    "labels": ["bug", "triaged"],
    "assignees": ["octocat"],
    "milestone": 1
  }'
```

## Close or reopen issue

Equivalent to `toggle_github_issue`.

Close:

```sh
curl -sS \
  -X PATCH \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/issues/$ISSUE_NUMBER" \
  -d '{"state":"closed"}'
```

Reopen:

```sh
curl -sS \
  -X PATCH \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/issues/$ISSUE_NUMBER" \
  -d '{"state":"open"}'
```

## Delete issue

There is no GitHub REST issue deletion used by Forge here. The current product surface has a `delete_github_issue` tool id, but the practical REST-safe pattern is closing the issue, not hard-deleting it.

Use the close flow above unless product behavior is intentionally changed.

## List issue comments

Equivalent to `list_github_issue_comments`.

```sh
curl -sS \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/issues/$ISSUE_NUMBER/comments?per_page=100"
```

## Get issue comment

Equivalent to `get_github_issue_comment`.

```sh
curl -sS \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/issues/comments/$COMMENT_ID"
```

## Create issue comment

Equivalent to `create_github_issue_comment`.

```sh
curl -sS \
  -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/issues/$ISSUE_NUMBER/comments" \
  -d '{"body":"Example comment"}'
```

## Update issue comment

Equivalent to `update_github_issue_comment`.

```sh
curl -sS \
  -X PATCH \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/issues/comments/$COMMENT_ID" \
  -d '{"body":"Updated comment"}'
```

## Delete issue comment

Equivalent to `delete_github_issue_comment`.

```sh
curl -sS \
  -X DELETE \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/issues/comments/$COMMENT_ID"
```

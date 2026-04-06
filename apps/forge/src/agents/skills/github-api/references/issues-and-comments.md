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

```sh
curl -sS \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/issues/$ISSUE_NUMBER"
```

## Create issue

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

There is no practical issue hard-delete path here. The safe operational behavior is closing the issue, not deleting it.

Use the close flow above unless product behavior is intentionally changed.

## List issue comments

```sh
curl -sS \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/issues/$ISSUE_NUMBER/comments?per_page=100"
```

## Get issue comment

```sh
curl -sS \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/issues/comments/$COMMENT_ID"
```

## Create issue comment

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

```sh
curl -sS \
  -X DELETE \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/issues/comments/$COMMENT_ID"
```

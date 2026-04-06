# Pull Requests

Use these patterns for pull request operations with `curl`.

## Shared setup

```sh
GITHUB_TOKEN="..."
ORG="your-org"
REPO="your-repo"
PR_NUMBER="123"
API="https://api.github.com"
```

## List pull requests

```sh
curl -sS \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/pulls?state=open&per_page=100"
```

Allowed states:

- `open`
- `closed`
- `all`

## Get one pull request

```sh
curl -sS \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/pulls/$PR_NUMBER"
```

## Create pull request

```sh
curl -sS \
  -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/pulls" \
  -d '{
    "title": "Example PR",
    "head": "feature/example",
    "base": "main",
    "body": "Created through curl"
  }'
```

## Update pull request

```sh
curl -sS \
  -X PATCH \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/pulls/$PR_NUMBER" \
  -d '{
    "title": "Updated title",
    "body": "Updated body",
    "base": "main",
    "state": "open"
  }'
```

Allowed states:

- `open`
- `closed`

## Merge pull request

```sh
curl -sS \
  -X PUT \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/pulls/$PR_NUMBER/merge" \
  -d '{
    "merge_method": "merge",
    "commit_title": "Merge example PR",
    "commit_message": "Merged through curl"
  }'
```

Allowed merge methods:

- `merge`
- `squash`
- `rebase`

## Close pull request without merging

There is no real pull request delete here. To discard a pull request without merging, close it by updating its state to `closed`.

```sh
curl -sS \
  -X PATCH \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/pulls/$PR_NUMBER" \
  -d '{"state":"closed"}'
```

## List pull request review comments

This uses review comments, not issue comments.

```sh
curl -sS \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/pulls/$PR_NUMBER/comments?direction=asc&per_page=100"
```

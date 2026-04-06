# Labels And Milestones

Use these patterns for labels, issue label assignment, and milestones with `curl`.

## Shared setup

```sh
GITHUB_TOKEN="..."
ORG="your-org"
REPO="your-repo"
ISSUE_NUMBER="123"
MILESTONE_NUMBER="7"
LABEL_NAME="bug"
API="https://api.github.com"
```

## List labels

```sh
curl -sS \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/labels?per_page=100"
```

## Create label

```sh
curl -sS \
  -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/labels" \
  -d '{
    "name": "bug",
    "color": "d73a4a",
    "description": "Something is broken"
  }'
```

## Update label

```sh
curl -sS \
  -X PATCH \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/labels/$LABEL_NAME" \
  -d '{
    "new_name": "confirmed-bug",
    "color": "b60205",
    "description": "Confirmed bug"
  }'
```

## Delete label

```sh
curl -sS \
  -X DELETE \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/labels/$LABEL_NAME"
```

## Add labels to an issue

```sh
curl -sS \
  -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/issues/$ISSUE_NUMBER/labels" \
  -d '{"labels":["bug","priority-high"]}'
```

## Remove one label from an issue

The Forge helper removes labels one by one and ignores `404`.

```sh
curl -sS \
  -X DELETE \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/issues/$ISSUE_NUMBER/labels/$LABEL_NAME"
```

## List milestones

```sh
curl -sS \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/milestones?state=open&per_page=100"
```

## Create milestone

```sh
curl -sS \
  -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/milestones" \
  -d '{
    "title": "v1.0",
    "description": "Initial milestone",
    "state": "open",
    "due_on": "2026-05-01T00:00:00Z"
  }'
```

## Update milestone

```sh
curl -sS \
  -X PATCH \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/milestones/$MILESTONE_NUMBER" \
  -d '{
    "title": "v1.0",
    "description": "Updated milestone",
    "state": "open",
    "due_on": "2026-05-10T00:00:00Z"
  }'
```

## Delete milestone

```sh
curl -sS \
  -X DELETE \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO/milestones/$MILESTONE_NUMBER"
```

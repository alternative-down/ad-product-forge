# Repositories

Use these patterns for repository operations with `curl`.

## Shared setup

Get credentials first:

```sh
GITHUB_TOKEN="..."
ORG="your-org"
REPO="your-repo"
API="https://api.github.com"
```

Load the shared headers from `github-rest-api.md`.

## List repositories available to the installation

```sh
curl -sS \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/installation/repositories"
```

## Get one repository

```sh
curl -sS \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO"
```

## Create repository

The Forge manager creates repos under the configured organization with:

- `name`
- `description`
- `private`
- `auto_init`
- `default_branch`

```sh
curl -sS \
  -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/orgs/$ORG/repos" \
  -d '{
    "name": "example-repo",
    "description": "Example repository",
    "private": true,
    "auto_init": false,
    "default_branch": "main"
  }'
```

## Update repository

```sh
curl -sS \
  -X PATCH \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO" \
  -d '{
    "name": "example-repo",
    "description": "Updated description",
    "private": true,
    "default_branch": "main"
  }'
```

## Delete repository

```sh
curl -sS \
  -X DELETE \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "$API/repos/$ORG/$REPO"
```

## Notes

- The Forge implementation defaults `owner` to the configured GitHub organization when omitted.
- Repository deletion is permanent.

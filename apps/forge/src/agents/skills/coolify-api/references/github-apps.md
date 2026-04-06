# GitHub Apps

Use these endpoints when the task needs to inspect or use GitHub App connections inside Coolify.

## Shared setup

```sh
COOLIFY_BASE_URL="https://coolify.example.com/api/v1"
COOLIFY_TOKEN="..."
GITHUB_APP_ID="123"
REPOSITORY_NAME="owner/repo"
```

## List GitHub Apps

```sh
curl -sS \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/github-apps"
```

## Create GitHub App in Coolify

```sh
curl -sS \
  -X POST \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  "$COOLIFY_BASE_URL/github-apps" \
  -d '{
    "name": "Forge GitHub App",
    "organization": "example-org",
    "app_id": "123456",
    "installation_id": "78910",
    "client_id": "Iv1.example",
    "client_secret": "secret",
    "webhook_secret": "secret",
    "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
    "api_url": "https://api.github.com",
    "html_url": "https://github.com"
  }'
```

## List repositories visible to one GitHub App

```sh
curl -sS \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/github-apps/$GITHUB_APP_ID/repositories"
```

## List branches for one repository

The current Forge integration passes `repository` as a query parameter.

```sh
curl -sS \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/github-apps/$GITHUB_APP_ID/branches?repository=$REPOSITORY_NAME"
```

## Guidance

- Use the GitHub App list first when you need a Coolify GitHub App UUID or numeric id.
- Use the repository list before creating an application to confirm the repository is visible to that GitHub App.
- Use the branch list before setting a deployment branch.

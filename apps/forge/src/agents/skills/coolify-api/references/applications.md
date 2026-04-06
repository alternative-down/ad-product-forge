# Applications

Use these endpoints for application lifecycle management in Coolify.

## Shared setup

```sh
COOLIFY_BASE_URL="https://coolify.example.com/api/v1"
COOLIFY_TOKEN="..."
APPLICATION_UUID="app-uuid"
GITHUB_APP_UUID="github-app-uuid"
PROJECT_UUID="project-uuid"
ENVIRONMENT_UUID="environment-uuid"
ENVIRONMENT_NAME="production"
SERVER_UUID="server-uuid"
DESTINATION_UUID="destination-uuid"
```

## List applications

```sh
curl -sS \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/applications"
```

## Get one application

```sh
curl -sS \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/applications/$APPLICATION_UUID"
```

## Project and environment helpers

The current Forge flow creates or reuses:

- a project
- a production environment
- the configured default server

List projects:

```sh
curl -sS \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/projects"
```

Create project:

```sh
curl -sS \
  -X POST \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  "$COOLIFY_BASE_URL/projects" \
  -d '{
    "name": "Forge",
    "description": "Default project created by Forge for Coolify deployments."
  }'
```

List environments for a project:

```sh
curl -sS \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/projects/$PROJECT_UUID/environments"
```

Create environment:

```sh
curl -sS \
  -X POST \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  "$COOLIFY_BASE_URL/projects/$PROJECT_UUID/environments" \
  -d '{"name":"production"}'
```

Get server:

```sh
curl -sS \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/servers/$SERVER_UUID"
```

## Create application

The current Forge implementation uses the private GitHub App creation path and sends:

- `project_uuid`
- `environment_name`
- `environment_uuid`
- `server_uuid`
- `github_app_uuid`
- `git_repository`
- `git_branch`
- `name`
- `domains`
- `ports_exposes`
- `build_pack`
- optional `build_command`
- optional `start_command`
- optional `install_command`
- optional `destination_uuid`

```sh
curl -sS \
  -X POST \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  "$COOLIFY_BASE_URL/applications/private-github-app" \
  -d '{
    "project_uuid": "'"$PROJECT_UUID"'",
    "environment_name": "'"$ENVIRONMENT_NAME"'",
    "environment_uuid": "'"$ENVIRONMENT_UUID"'",
    "server_uuid": "'"$SERVER_UUID"'",
    "destination_uuid": "'"$DESTINATION_UUID"'",
    "github_app_uuid": "'"$GITHUB_APP_UUID"'",
    "git_repository": "owner/repo",
    "git_branch": "main",
    "name": "example-app",
    "domains": "https://example.example.com",
    "ports_exposes": "3000",
    "build_pack": "nixpacks",
    "build_command": "npm run build",
    "start_command": "npm run start",
    "install_command": "npm ci"
  }'
```

## Update application

The current Forge flow sends only provided fields:

- `name`
- `description`
- `ports_exposes`
- `build_command`
- `start_command`
- `install_command`
- `branch`
- `fqdn`

```sh
curl -sS \
  -X PATCH \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  "$COOLIFY_BASE_URL/applications/$APPLICATION_UUID" \
  -d '{
    "name": "example-app",
    "description": "Updated description",
    "ports_exposes": "3000",
    "build_command": "npm run build",
    "start_command": "npm run start",
    "install_command": "npm ci",
    "branch": "main",
    "fqdn": "https://example.example.com"
  }'
```

## Start, stop, restart

Start:

```sh
curl -sS \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/applications/$APPLICATION_UUID/start"
```

Stop:

```sh
curl -sS \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/applications/$APPLICATION_UUID/stop"
```

Restart:

```sh
curl -sS \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/applications/$APPLICATION_UUID/restart"
```

## Delete application

```sh
curl -sS \
  -X DELETE \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/applications/$APPLICATION_UUID"
```

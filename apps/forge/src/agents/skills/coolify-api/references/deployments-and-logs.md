# Deployments And Logs

Use these endpoints for deployment history, deployment logs, and runtime logs.

## Shared setup

```sh
COOLIFY_BASE_URL="https://coolify.example.com/api/v1"
COOLIFY_TOKEN="..."
APPLICATION_UUID="app-uuid"
DEPLOYMENT_UUID="deployment-uuid"
```

## List deployments for one application

```sh
curl -sS \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/deployments?application_uuid=$APPLICATION_UUID&per_page=20"
```

## Get one deployment

```sh
curl -sS \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/deployments/$DEPLOYMENT_UUID"
```

The current Forge flow reads:

- `logs`
- `status`
- `uuid` or `deployment_uuid`

## Get latest deployment logs

1. List deployments for the application.
2. Pick the most recent deployment UUID.
3. Fetch that deployment directly.

## Get application runtime logs

```sh
curl -sS \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/applications/$APPLICATION_UUID/logs"
```

Optional query parameters used by Forge:

- `lines`
- `since`

Example:

```sh
curl -sS \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/applications/$APPLICATION_UUID/logs?lines=200&since=1712000000"
```

## Guidance

- Use deployment logs for build or release failures.
- Use application runtime logs for running container behavior.
- If the task asks for the latest deployment log and no UUID is known, resolve it from the deployment list first.

# Environment Variables

Use these endpoints for Coolify application environment variables.

## Shared setup

```sh
COOLIFY_BASE_URL="https://coolify.example.com/api/v1"
COOLIFY_TOKEN="..."
APPLICATION_UUID="app-uuid"
ENV_UUID="env-uuid"
ENV_KEY="EXAMPLE_KEY"
```

## List environment variables

```sh
curl -sS \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/applications/$APPLICATION_UUID/envs"
```

## Create environment variable

```sh
curl -sS \
  -X POST \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  "$COOLIFY_BASE_URL/applications/$APPLICATION_UUID/envs" \
  -d '{
    "key": "EXAMPLE_KEY",
    "value": "example-value",
    "is_preview": false,
    "is_literal": false,
    "is_multiline": false,
    "is_shown_once": false
  }'
```

## Update environment variable

The current Forge flow updates env vars through the bulk patch endpoint and sends a single-item `data` array.

```sh
curl -sS \
  -X PATCH \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  "$COOLIFY_BASE_URL/applications/$APPLICATION_UUID/envs/bulk" \
  -d '{
    "data": [
      {
        "key": "EXAMPLE_KEY",
        "value": "updated-value",
        "is_preview": false,
        "is_literal": false,
        "is_multiline": false,
        "is_shown_once": false
      }
    ]
  }'
```

## Delete environment variable

First list envs to resolve the env UUID for the key, then delete it:

```sh
curl -sS \
  -X DELETE \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/applications/$APPLICATION_UUID/envs/$ENV_UUID"
```

## Guidance

- Resolve the env UUID from the current env list before delete.
- Keep the full flag set explicit when updating through the bulk endpoint.
- Use `is_multiline` when the value spans multiple lines.
- Use `is_literal` when the value should be treated literally by Coolify.

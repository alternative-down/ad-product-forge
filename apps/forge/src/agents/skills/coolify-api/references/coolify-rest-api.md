# Coolify REST API

Use these patterns when calling Coolify with `curl`.

## Shared shell setup

```sh
COOLIFY_BASE_URL="https://coolify.example.com/api/v1"
COOLIFY_TOKEN="..."
```

## Shared curl pattern

```sh
curl -sS \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  "$COOLIFY_BASE_URL/SOME/PATH"
```

For requests with a JSON body:

```sh
curl -sS \
  -X POST \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  "$COOLIFY_BASE_URL/SOME/PATH" \
  -d '{"key":"value"}'
```

## Guidance

- The token is the Coolify admin bearer token.
- Keep payloads literal and explicit.
- Encode UUIDs or names in URLs if they may contain special characters.
- Mutating calls should target the exact application UUID, project UUID, environment UUID, or server UUID intended by the task.

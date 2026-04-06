# Get Coolify Credentials

This skill assumes a future `get_coolify_credentials` step that returns the data needed to call Coolify directly.

## Expected credential shape

Based on the current Forge Coolify integration, the credential payload should provide:

- `baseUrl`
  - full Coolify API base URL
- `adminToken`
  - bearer token for API access
- `serverId`
  - default Coolify server UUID used by Forge
- `destinationId`
  - default destination UUID used by Forge when creating applications
- `applicationsBaseDomain`
  - optional base domain for generated application hostnames

These fields reflect the current Coolify integration config used by Forge.

## Meaning

- `baseUrl` is the API origin used for every request.
- `adminToken` is the bearer token sent in the `Authorization` header.
- `serverId` identifies the default target server for application creation.
- `destinationId` identifies the default destination used during deployment setup.
- `applicationsBaseDomain` helps build application FQDNs when the task needs to define domains explicitly.

## Safety

- Treat `adminToken` as secret.
- Do not print it in normal outputs.
- Do not store it in long-lived files unless the task explicitly requires it.

## Guidance

- Fetch fresh credentials from the credential step instead of hardcoding them.
- If the task only reads data, use the same credentials but avoid unnecessary mutating calls.

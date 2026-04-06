# Get GitHub Credentials

Use `get_github_git_credentials` when raw GitHub access is needed.

## Tool id

- `get_github_git_credentials`

## Input

- `repositoryName`
  - optional
  - use it when the work targets one repository
  - leave it empty when the task needs credentials without a single repository target yet

## Return shape

The Forge GitHub manager returns:

- `username`
  - always `x-access-token`
- `token`
  - short-lived GitHub installation token
- `expiresAt`
  - token expiration time
- `repositoryUrl`
  - present when `repositoryName` was provided
- `gitUserName`
  - app display name for git author config
- `gitUserEmail`
  - app email for git author config

The implementation is in:

- `apps/forge/src/github/tools.ts`
- `apps/forge/src/github/manager.ts`

## Meaning

- The token comes from the agent GitHub App installation, not from a personal account.
- Access is limited to repositories the installed GitHub App can reach.
- The token is temporary, so always fetch fresh credentials for new work instead of assuming reuse.

## Decision rule

Use `get_github_git_credentials` when the task needs:

- a raw GitHub REST endpoint
- direct git commands over HTTPS
- low-level repository automation

## Safety

- Treat `token` as secret.
- Do not print it in final answers.
- Do not store it in long-lived files unless the task explicitly requires it.

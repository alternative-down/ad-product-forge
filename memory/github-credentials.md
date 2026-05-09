# GitHub Token Management

## Token lifecycle

GitHub tokens issued via `get_github_git_credentials` expire after ~1 hour. When the current token is about to expire or starts getting "Invalid username or token" errors on push, fetch fresh credentials.

## Always use `get_github_git_credentials` — never hardcode tokens

Tokens rotate. The last token before midnight (00:00 UTC) expires and a new one takes over. Never store tokens in memory files, workspace notes, or code.

## How to push after token refresh

```bash
# 1. Get fresh credentials
ghs_xxx = get_github_git_credentials()["token"]

# 2. Update remote URL with new token
git remote set-url origin "https://x-access-token:{NEW_TOKEN}@github.com/alternative-down/ad-product-forge.git"

# 3. Push
git push origin branch-name --force
```

## Push failure pattern

```
remote: Invalid username or token. Password authentication is not supported for Git operations.
fatal: Authentication failed for 'https://github.com/alternative-down/ad-product-forge.git/'
```

→ Token is dead. Fetch fresh credentials and update remote.

## API vs Git credentials

- `get_github_git_credentials` gives a token good for API calls AND git operations
- The workspace remote URL uses this token embedded in the URL
- Every push needs a fresh token check if it's been > 1 hour since the last push

## Timing

Token issued: `expiresAt` in the response (ISO timestamp). Push before expiry or fetch fresh ones. The 00:00 UTC boundary is when tokens tend to rotate — check credentials after midnight and update remote before next push.
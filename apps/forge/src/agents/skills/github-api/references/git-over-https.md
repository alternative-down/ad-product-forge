# Git Over HTTPS

Use this when raw git commands are needed.

## Inputs from Forge

From `get_github_git_credentials`:

- `username`
- `token`
- `repositoryUrl`
- `gitUserName`
- `gitUserEmail`

## Clone

If `repositoryUrl` is present:

```sh
git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/ORG/REPO.git"
```

Or use the returned repository URL:

```sh
git clone "https://x-access-token:${GITHUB_TOKEN}@${REPOSITORY_URL#https://}"
```

## Configure author

```sh
git config user.name "$GIT_USER_NAME"
git config user.email "$GIT_USER_EMAIL"
```

## Pull and push

```sh
git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/ORG/REPO.git"
git fetch origin
git pull --rebase origin BRANCH
git push origin HEAD
```

## Guidance

- Fetch fresh credentials close to the moment of push.
- Use the returned `gitUserName` and `gitUserEmail` for commits made through the GitHub App identity.
- Prefer repository-specific credentials when the task concerns one repository.
- Avoid echoing the token in logs or final responses.

Use raw git only when actual repository checkout or branch/file history operations are required.

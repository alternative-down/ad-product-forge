# ad-product-forge

Monorepo TypeScript com npm workspaces + turborepo.

## Stack inicial

- npm workspaces
- turborepo
- TypeScript
- Vitest
- GitHub Actions (lint, typecheck, test, build)

## Scripts

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run format
npm run format:check
npm run changeset
npm run version-packages
```

## Commit e versionamento

- `pre-commit` (Husky): format (staged), lint, typecheck, test
- `commit-msg` (Husky + commitlint): valida padrão de commit (`feat:`, `fix:`, `chore:`...)
- `changesets`: gera versionamento e `CHANGELOG.md` quando você rodar `npm run version-packages`

## Codex review test

Este PR existe para validar gatilho @codex em comentário.

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

## API de produção (v1)

```bash
# build geral
npm run build

# subir API (porta 3000 por padrão)
npm run start --workspace @ad-product-forge/api

# smoke
curl http://127.0.0.1:3000/health
```

## Commit e versionamento

- `pre-commit` (Husky): format (staged), lint, typecheck, test
- `commit-msg` (Husky + commitlint): valida padrão de commit (`feat:`, `fix:`, `chore:`...)
- `changesets`: gera versionamento e `CHANGELOG.md` quando você rodar `npm run version-packages`

## Codex review test

Este PR existe para validar gatilho @codex em comentário.

## Codex body trigger test 2
Teste: trigger apenas no body da PR, sem comentário.

# ad-product-forge

Monorepo TypeScript com npm workspaces + turborepo.

## Stack inicial

- npm workspaces
- turborepo
- TypeScript
- Vitest
- GitHub Actions (lint, typecheck, test, build)

## Sequência do pipeline (código atual)

`Ingest (D1) -> Graph (D2) -> Insight+Score (D3) -> Orchestrator (D4) -> Ingress Adapters (D5) -> Source Runner (D6)`

Owners lógicos:
- `ingest logic` (D1)
- `graph-transformer` (D2)
- `insight+score logic` (D3)
- `runner` (D4)
- `adapter logic` (D5)
- `CLI/API entry` (D6)

Detalhes completos em: `docs/ARCHITECTURE.md`.

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

### Local (node)

```bash
# build geral
npm run build

# subir API (porta 3000 por padrão)
npm run start --workspace @ad-product-forge/api

# smoke
curl http://127.0.0.1:3000/health
```

### Container (docker compose)

```bash
docker compose up --build -d
curl http://127.0.0.1:3000/health
```

### Executar pipeline via HTTP

```bash
curl -X POST http://127.0.0.1:3000/v1/pipeline/run \
  -H 'content-type: application/json' \
  -d '{
    "sourceType": "manual",
    "payload": {
      "item_id": "example-1",
      "timestamp": "2026-03-07T00:00:00.000Z",
      "note": "erro recorrente em onboarding",
      "author": "ops",
      "context": {"channel": "support"}
    }
  }'
```

### Autenticação opcional por chave

Se `PIPELINE_API_KEY` estiver definida, o endpoint `/v1/pipeline/run` exige header `x-api-key`.

### Observabilidade básica (API)

- `x-request-id`: se enviado no request, retorna no response; se não, a API gera automaticamente.
- Logs estruturados em JSON por evento (`pipeline_run_success`, erros e warnings).
- Endpoint `GET /metrics` com contadores simples e latência média.

```bash
curl -X POST http://127.0.0.1:3000/v1/pipeline/run \
  -H 'content-type: application/json' \
  -H 'x-api-key: sua-chave' \
  -d '{"sourceType":"manual","payload":{"item_id":"example-2","timestamp":"2026-03-07T00:00:00.000Z","note":"teste"}}'
```

## Commit e versionamento

- `pre-commit` (Husky): format (staged), lint, typecheck, test
- `commit-msg` (Husky + commitlint): valida padrão de commit (`feat:`, `fix:`, `chore:`...)
- `changesets`: gera versionamento e `CHANGELOG.md` quando você rodar `npm run version-packages`

## Codex review test

Este PR existe para validar gatilho @codex em comentário.

## Codex body trigger test 2
Teste: trigger apenas no body da PR, sem comentário.

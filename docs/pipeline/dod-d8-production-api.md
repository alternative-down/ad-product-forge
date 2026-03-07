# D8 — Production API v1

## Objetivo
Expor endpoint HTTP de execução do pipeline para uso em produção.

## Entregas
- Novo workspace `@ad-product-forge/api`.
- Endpoint `GET /health`.
- Endpoint `POST /v1/pipeline/run` recebendo:
  - `sourceType`: `coleta|manual|webhook`
  - `payload`: payload bruto da origem
  - `parentJobId?`
- Execução interna:
  - `normalizeToPipelineInput`
  - `runPipelineFromSource` (pipeline completo)
- Resposta estruturada com `stage`, `nextAction`, `output`.

## Testes
- Healthcheck retornando 200.
- Pipeline executando via API com payload manual válido.
- Rejeição 400 em payload inválido.

## Evidência (workspace `@ad-product-forge/api` e `@ad-product-forge/core`)
- `npm test --workspace @ad-product-forge/api`
- `npm test --workspace @ad-product-forge/core`
- `npm run typecheck --workspace @ad-product-forge/api`
- `npm run build --workspace @ad-product-forge/api`

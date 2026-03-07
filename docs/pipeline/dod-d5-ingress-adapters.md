# D5 — Ingress Adapters (coleta/manual/webhook)

## Objetivo
Normalizar payloads heterogêneos de entrada para o contrato único `PipelineInput` antes da orquestração.

## Entregas
- `normalizeToPipelineInput(sourceType, payload)` em `apps/core/src/ingress/normalizer.ts`.
- Adapters cobertos para:
  - `coleta` (`item_id`, `timestamp`, `content`, `context`, `link?`)
  - `manual` (`item_id`, `timestamp`, `note`, `author?`, `context`, `link?`)
  - `webhook` (`id`, `occurred_at`, `body`, `meta`, `url?`)
- Validação final via `validateInput` para garantir contrato v1.

## Testes
- 3 testes de normalização (um por source type).
- 1 teste de erro para payload inválido.

## Evidência (workspace `@ad-product-forge/core`)
- `npm test --workspace @ad-product-forge/core`
- `npm run typecheck --workspace @ad-product-forge/core`
- `npm run build --workspace @ad-product-forge/core`

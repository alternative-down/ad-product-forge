# D4 — Pipeline Orchestrator v1

## Objetivo
Encadear `ingest -> graph -> insight -> score` com decisão única de roteamento por status (`ok->forward`, `retry->retry`, `error->drop`).

## Entregas
- `runPipelineV1(input, deps)` implementado em `apps/core/src/pipeline/orchestrator.ts`.
- Encadeamento completo das 4 etapas com retorno estruturado (`PipelineRunResult`):
  - outputs de cada etapa
  - `finalOutput`
  - `stage` final atingido
  - `nextAction`
- Mapeamento fixo de orquestração aplicado por status:
  - `ok => forward`
  - `retry => retry`
  - `error => drop`
- Suporte a injeção de dependências para testes (`stores`, `now`, `ingestDeps`, `artifactBaseDir`).

## Testes
- Happy path: execução ponta-a-ponta até `score` com `nextAction=forward`.
- Falha no `graph`: saída em `stage=graph` com `nextAction=drop`.

## Evidência (workspace `@ad-product-forge/core`)
- `npm test --workspace @ad-product-forge/core`
- `npm run typecheck --workspace @ad-product-forge/core`
- `npm run build --workspace @ad-product-forge/core`

# D2 — Graph (sem classes)

## Objetivo
Transformar entrada do ingest em artefato de grafo (nós/arestas), persistir histórico versionado e retornar output v1.

## DoD
- `runGraphStage` recebe `PipelineInput` + `PipelineOutput` do D1 e retorna output v1.
- `buildGraphNodes` e `buildGraphEdges` implementados como funções puras.
- `createArtifactStore` implementado como factory funcional (sem classes), com histórico por `job_id`.
- `status` de saída: `ok` no fluxo feliz, `error` em falha.
- Testes cobrindo construção de nós, arestas e persistência/versionamento.
- `npm test`, `npm run typecheck` e `npm run build` passando no workspace `@ad-product-forge/core`.

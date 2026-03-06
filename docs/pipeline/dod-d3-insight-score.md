# D3 — Insight + Score (sem classes)

## Objetivo
Extrair insights estruturados a partir do output do graph e calcular score final (0–100) seguindo a fórmula V1 do projeto.

## Entregas
- `runInsightStage` recebe `PipelineInput` + `PipelineOutput` (D2) e retorna output v1.
- `buildInsights` implementado como função pura para gerar insights estruturados.
- `createInsightStore` implementado como factory funcional (sem classes), com histórico por `job_id`.
- `runScoreStage` recebe output do insight e calcula score final com fórmula V1.
- `computeWeightedScore` implementado como função pura com pesos:
  - `0.35 evidence_strength`
  - `0.30 recurrence`
  - `0.20 pain_intensity`
  - `0.15 context_breadth`
- `createScoreStore` funcional para persistência do artefato de score.
- Saída mantém contrato v1 (`status`, `score`, `artifacts`, `processed_at`).

## Regras de status
- Insight:
  - `ok` no fluxo feliz.
  - `retry` se etapa anterior não estiver `ok`.
  - `error` em falha de execução.
- Score:
  - `ok` com score calculado.
  - `retry` quando ainda não existe artefato de insight.
  - `error` em falha de execução.

## Evidências (workspace `@ad-product-forge/core`)
- `npm test --workspace @ad-product-forge/core`
- `npm run typecheck --workspace @ad-product-forge/core`
- `npm run build --workspace @ad-product-forge/core`

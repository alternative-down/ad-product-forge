# D6 — Source Runner (entrada direta por source_type)

## Objetivo
Disponibilizar ponto único para executar pipeline completo recebendo payload bruto por tipo de origem.

## Entregas
- `runPipelineFromSource({ sourceType, payload }, deps)` em `apps/core/src/pipeline/source-runner.ts`.
- Fluxo interno:
  - normaliza payload (`normalizeToPipelineInput`)
  - executa orquestração completa (`runPipelineV1`)
- Suporte para `coleta`, `manual` e `webhook`.

## Testes
- Execução ponta-a-ponta a partir de payload bruto para os 3 tipos de origem.
- Verificação de `status=ok` e `nextAction=forward` no fluxo feliz.

## Evidência (workspace `@ad-product-forge/core`)
- `npm test --workspace @ad-product-forge/core`
- `npm run typecheck --workspace @ad-product-forge/core`
- `npm run build --workspace @ad-product-forge/core`

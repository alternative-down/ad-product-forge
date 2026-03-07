# Release Checklist — Pipeline v1

## Scope
`ingest -> graph -> insight -> score` + ingress adapters (`coleta/manual/webhook`) + source runner.

## Checklist

- [x] Contract v1 definido (`input`/`output`, status mapping)
- [x] D1 ingest implementado e em main
- [x] D2 graph implementado e em main
- [x] D3 insight + score implementado e em main
- [x] D4 orchestrator implementado e em main
- [x] D5 ingress adapters implementado e em main
- [x] D6 source runner implementado e em main
- [x] E2E para `coleta/manual/webhook` passando
- [x] Test suite geral passando (`@ad-product-forge/core`)
- [x] Typecheck passando (`@ad-product-forge/core`)
- [x] Build passando (`@ad-product-forge/core`)

## Observações
- Fluxo de merge segue manual (branch protection/rulesets no plano atual).
- Trigger de review Codex/OpenAI depende de comentário da conta do Nicolas.

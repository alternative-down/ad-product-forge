# DoD — Pipeline v1

## Etapas

- **ingest (D1 / Kael):** valida `input` contra schema v1, gera `job_id`, persiste payload bruto e retorna `output` v1.
- **graph (D2 / Kael):** transforma entrada em artefatos versionados, persiste referências e retorna `output` v1.
- **insight (D3 / Zane):** extrai insights estruturados a partir dos artefatos e retorna `output` v1 com `status` + `processed_at`.
- **score (D3 / Zane):** calcula `score` (0–100) quando aplicável e retorna `output` v1 final.

## Regras fixas

- Contrato v1 não deve ser reaberto durante a implementação D1–D4.
- `context` entra como input bruto.
- `artifacts` deve manter histórico/versionamento.
- Mapeamento de orquestração por status: `ok→forward`, `retry→retry`, `error→drop`.

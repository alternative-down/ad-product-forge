# ARCHITECTURE — Pipeline v1 (estado atual)

## Sequência real do código

1. **Ingest** (`D1/ingest`)
   - Função: validar input v1, gerar `job_id`, estruturar output base.
   - Owner lógico: `ingest logic`.

2. **Graph** (`D2/graph`)
   - Função: enriquecer relações/entidades e persistir artefato de graph.
   - Owner lógico: `graph-transformer`.

3. **Insight + Score** (`D3/insight-score`)
   - Função: extrair insights e calcular score final (0–100).
   - Owner lógico: `insight+score logic`.

4. **Orchestrator** (`D4/orchestrator`)
   - Função: executar pipeline sequencial e mapear ação por status.
   - Mapeamento: `ok -> forward`, `retry -> retry`, `error -> drop`.
   - Owner lógico: `runner`.

5. **Ingress Adapters** (`D5/ingress`)
   - Função: normalizar payloads `coleta|manual|webhook` para contrato único.
   - Owner lógico: `adapter logic`.

6. **Source Runner** (`D6/source-runner`)
   - Função: executar pipeline completo a partir de payload bruto normalizado.
   - Owner lógico: `CLI/API entry`.

## Entrada e saída (contrato v1)

- **Input**: `item_id`, `timestamp`, `content`, `context`, `link?`, `source_type`.
- **Output**: `item_id`, `job_id`, `parent_job_id?`, `status`, `score?`, `artifacts`, `processed_at`.

## Camada de produção API (status atual)

- Endpoints principais:
  - `POST /v1/pipeline/run`
  - `POST /v1/hooks/external` (ingestão de eventos externos)
- Endpoints de suporte: `GET /health`, `GET /ready`.
- Segurança incremental:
  - `PIPELINE_API_KEY` (opcional) + header `x-api-key`.
- Resiliência incremental:
  - `x-idempotency-key` para replay seguro e proteção anti-duplicação.

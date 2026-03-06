# Feature Request — Opportunity Radar

## Status
Definição funcional consolidada (V1)

## 1) Visão
Construir um sistema que identifica oportunidades de produto antes da maioria, transformando sinais dispersos de mercado em hipóteses de negócio acionáveis.

> Observação: micro-SaaS é um formato de execução possível, não a limitação do sistema.

---

## 2) Objetivo
Ter uma máquina contínua para:
1. Descobrir oportunidades com potencial real
2. Organizar evidências de forma estruturada
3. Priorizar com critérios claros
4. Entregar saída pronta para a etapa de proposta de solução

---

## 3) Problema que estamos resolvendo
Hoje, ideação costuma depender de:
- inspiração pontual
- opinião pessoal
- sinais fracos sem estrutura

Queremos sair de ideação ad-hoc para um processo repetível e orientado por evidência.

Também queremos evitar o erro de olhar apenas para “dor explícita”: há oportunidades em desejo, entretenimento e necessidades latentes (quando o usuário nem sabe nomear o problema).

---

## 4) Princípios
- Radar de oportunidades (não só “gerador de ideias”)
- Coleta ativa + passiva no mesmo ciclo
- Operação 100% autônoma
- Simplicidade operacional
- Rastreabilidade de evidência
- Stack em aberto nesta fase (somente opções)

---

## 5) Frentes de descoberta
### Coleta ativa
- Processo inicial com agente firecrawl orientado por prompt
- Prompt inclui locais iniciais + instrução para explorar fontes relacionadas
- Retorno esperado por item coletado:
  - link do conteúdo
  - conteúdo bruto
  - contexto adicional da coleta
- Comunidades, reviews, reclamações, benchmarking e inspiração/opinião

### Coleta passiva
- Endpoint único de ingestão
- Eventos de diferentes fontes do sistema e apps gerados

### Regra operacional
- Registra insumo bruto
- Dedup por `content_hash`
- Merge de `metadata_json` em duplicata
- Qualquer alteração no metadata => `processed_flag = false`
- Enfileira para processamento sequencial item a item

---

## 6) Modelo conceitual
Ordem de leitura do sinal:
1. Contexto
2. Rotina/comportamento real
3. Tensão (dor, desejo ou entretenimento)
4. Problema (quando nomeável)

---

## 7) Definições consolidadas da feature
### 7.1 Schema mínimo do insumo bruto
Campos fixos:
- `item_id`
- `source_type` (`active` | `passive`)
- `source_name`
- `captured_at`
- `content_raw`
- `content_hash`
- `origin_ref`
- `processed_flag` (boolean)

Campo flexível:
- `metadata_json`

### 7.2 Fluxo da feature
**coletas brutas → graph → insights → pontuação**

### 7.3 Mineração
- Execução diária
- Acionamento em cascata por processo posterior
- Modos: bottom-up e top-down

### 7.4 Taxonomia
- Sem taxonomia fixa na V1
- Categorias emergem dos agentes

### 7.5 Ranking
- Todo insight extraído entra no ranking (sem limiar de entrada)
- Escala 0–100 para critérios antes de ponderação

### 7.6 Insight imutável (campos)
- `insight_id`
- `insight_type` (`problema` | `dor` | `desejo` | `oportunidade`)
- `title`
- `summary_inferred`
- `source_item_ids`
- `graph_evidence_refs`
- `context_snapshot`
- `desired_outcome`
- `current_workaround`
- `constraint_signals`
- `metadata_json`
- `created_at`

### 7.7 Pontuação (campos)
- `insight_id`
- `rank_score`
- `rank_reason`

### 7.8 Handoff para etapa posterior
Pacote único por insight:
- `insight`
- `evidences[]`
- `ranking`
- `handoff_context`
- `ready_for_solution = true`

---

## 8) Log de decisões-chave
- 2026-03-05: foco mudou para Opportunity Radar
- 2026-03-05: coleta ativa + passiva consolidadas
- 2026-03-06: operação 100% autônoma consolidada
- 2026-03-06: dedup por hash + merge de metadata + reprocessamento por mudança
- 2026-03-06: fila com processamento sequencial item a item
- 2026-03-06: ranking sem limiar de entrada
- 2026-03-06: viabilidade removida desta feature (fica para proposta)
- 2026-03-06: insight definido como imutável e handoff fechado

# Feature Request — Opportunity Radar

## Status
Draft (em discussão)

## 1) Visão
Construir um sistema que identifica oportunidades de produto antes da maioria, transformando sinais dispersos de mercado em hipóteses de negócio acionáveis.

> Observação: micro-SaaS é um formato de execução possível, não a limitação do sistema.

---

## 2) Objetivo
Ter uma máquina contínua para:
1. Descobrir oportunidades com potencial real
2. Organizar evidências de forma estruturada
3. Priorizar com critérios claros
4. Gerar propostas de produto menores e testáveis

---

## 3) Problema que estamos resolvendo
Hoje, ideação costuma depender de:
- inspiração pontual
- opinião pessoal
- sinais fracos sem estrutura

Queremos sair de ideação ad-hoc para um processo repetível e orientado por evidência.

Também queremos evitar o erro de olhar apenas para “dor explícita”: há oportunidades em desejo, entretenimento e necessidades latentes (quando o usuário nem sabe nomear o problema).

---

## 4) Princípios (definidos até agora)
- Pensar no sistema como **radar de oportunidades**, não só “gerador de ideias”
- Não ficar preso a uma única premissa de coleta
- Combinar múltiplos caminhos de descoberta
- Registrar tudo para análise posterior (rastreabilidade)
- Tratar a coleta como geração contínua de **insumos** por vias diferentes
- Unificar **coleta ativa** e **coleta passiva** no mesmo ciclo de inteligência
- Operar de forma **100% autônoma**, sem etapa humana no fluxo

---

## 5) Frentes de descoberta consideradas
### Coleta ativa (mercado/exploração)
- Processos de busca ativa em múltiplas fontes (ex.: firecrawl e outros meios)
- Mineração de dores em comunidades (Discord, Reddit, etc.)
- Extração de pedidos/reclamações em produtos SaaS existentes
- Reclamações públicas (ex.: plataformas de reclamação)
- Mapeamento de gaps de features e usabilidade de concorrentes
- Agentes LLM em personas para explorar e relatar fricções
- Uso de contas dedicadas para navegação/avaliação em fluxos reais
- Fontes de inspiração/opinião e análise crítica de narrativas de mercado

### Coleta passiva (operação dos produtos e integrações)
- Entrada via endpoint único de ingestão
- Recebe eventos de diferentes fontes do sistema e dos apps gerados
- Fontes crescem ao longo do desenvolvimento
- Registro em formato bruto, com deduplicação e estruturação mínima

### Observação de fluxo
- A base de insumos consolida dados ativos e passivos
- Cada novo insumo é enviado para fila após registro
- Processamento ocorre item a item, de forma sequencial

---

## 6) Oportunidades de análise levantadas
- Churn e abandono
- Fricções de onboarding
- Workarounds/gambiarras recorrentes
- Jobs-to-be-done ocultos
- Gargalos operacionais manuais
- Gaps por nicho/localização
- Migração entre ferramentas e motivos
- Diferença entre promessa de marketing e uso real
- Necessidades latentes inferidas por contexto e rotina (entrelinhas)

---

## 6.1) Modelo conceitual discutido
Ordem para entender oportunidade com mais profundidade:
1. Contexto
2. Rotina/comportamento real
3. Tensão (dor, desejo ou entretenimento)
4. Problema (quando nomeável)

---

## 7) O que precisamos definir na sequência
1. Escopo da V1 do radar
2. Critérios de qualidade do sinal
3. Critérios de priorização da oportunidade
4. Frequência/cadência de operação

## 7.0) Decisão registrada — schema mínimo de insumo bruto
### Campos fixos mínimos
- `item_id`
- `source_type` (`active` | `passive`)
- `source_name`
- `captured_at`
- `content_raw`
- `content_hash` (deduplicação)
- `origin_ref`
- `processed_flag` (boolean)

### Campo flexível
- `metadata_json` para contexto e dados adicionais da coleta

### Regra conceitual de deduplicação (definida)
- deduplicação primária por `content_hash`
- quando chega novo evento do mesmo item, faz **merge de `metadata_json`**
- qualquer alteração em `metadata_json` marca `processed_flag = false` para reprocessamento

Objetivo da decisão:
- manter a base simples para dedup e controle de processamento
- concentrar variações de contexto/coleta em campo dinâmico único

---

## 7.1) Macroprocesso conceitual (balaio → inteligência)
1. **Base de insumos**
   - recebe entradas ativas e passivas
   - deduplica e consolida registros brutos
2. **Enriquecimento semântico**
   - cada novo item é analisado e conectado a contexto/rotina/tensão
   - categorização e relacionamento com registros já existentes
3. **Mineração sob demanda**
   - exploração livre (bottom-up)
   - investigação guiada por hipótese (top-down)
4. **Decisão determinística**
   - pontuação
   - rankeamento
   - saída acionável (itens prontos para proposta de app)

### Gatilho da mineração (definido)
- execução diária
- acionamento por processo posterior (cascata)
- o processo downstream será detalhado posteriormente

## 7.2) Camada de qualidade e decisão
- enriquecimento com papéis distintos de **análise** e **revisão**
- pontuação em duas lentes:
  - força da evidência
  - viabilidade/fit de execução
- decisão por status:
  - **priorizar**
  - **delayed**
  - **descartar**

---

## 8) Lacunas preenchidas nesta rodada (assumidas)
- Taxonomia fixa na V1: **não**. Categorias emergem dos agentes.
- Limiar de entrada no ranking: **não existe**. Todo insight extraído entra no ranking.
- Revisão de ranking: acompanha a mineração diária em cascata.

## 8.1) Definição fechada nesta rodada
- Handoff minerador → gerador de propostas será um pacote único por insight com: `insight`, `evidences[]`, `ranking`, `handoff_context`, `ready_for_solution=true`.

## 8.2) Definição fechada nesta rodada
- Fluxo simplificado da feature: **coletas brutas → graph → insights → pontuação**.
- Insights são criados uma única vez (imutáveis), sem atualização/histórico de versões.

## 8.3) Definição fechada nesta rodada
- Campos do insight imutável mantidos conforme definição anterior:
  - `insight_id`, `insight_type`, `title`, `summary_inferred`, `source_item_ids`, `graph_evidence_refs`, `context_snapshot`, `desired_outcome`, `current_workaround`, `constraint_signals`, `metadata_json`, `created_at`
- Campos de pontuação associados:
  - `insight_id`, `rank_score`, `rank_reason`

---

## 9) Decisões já tomadas
- Enquadramento principal: **Opportunity Radar**
- Vamos discutir e refinar por partes antes de implementação técnica
- Definições de stack ficam em aberto nesta fase (registrar opções, sem escolha antecipada)

---

## 10) Log de discussão
- 2026-03-05: reposição de premissas; foco mudou de “gerar ideias de micro-SaaS” para “detectar oportunidades de forma contínua”
- 2026-03-05: consolidada visão de múltiplas fontes + agentes + registro para análise posterior
- 2026-03-05: alinhado que as fontes não se limitam a “sinais de dor”; também entram inspiração, opinião e benchmark
- 2026-03-05: alinhado modelo de insumos por coleta ativa + coleta passiva
- 2026-03-05: definida retroalimentação pós-lançamento (atendimento, solicitações, social, falhas e limites de execução da IA)
- 2026-03-05: reforçado que oportunidade pode nascer de dor, desejo ou entretenimento
- 2026-03-05: incluída necessidade latente (dor não explícita) via leitura de contexto/rotina/entrelinhas
- 2026-03-05: consolidado fluxo “balaio” com ingestão ampla + pipeline único (minerar, categorizar, pontuar, ranquear)
- 2026-03-06: refinado para macroprocessos separados (base de insumos, enriquecimento semântico e mineração sob demanda)
- 2026-03-06: adicionada camada de qualidade com papéis de análise/revisão e decisão determinística por status (priorizar/delayed/descartar)
- 2026-03-06: schema bruto ajustado para `processed_flag` boolean (sem máquina de estados na camada de insumos)
- 2026-03-06: dedup definido por `content_hash`; duplicatas fazem merge de `metadata_json` e sempre reabrem processamento (`processed_flag = false`) quando houver qualquer mudança no metadata
- 2026-03-06: fluxo operacional definido como enqueue por novo insumo + processamento sequencial item a item
- 2026-03-06: schema do minerador mantido por ora em 3 artefatos por rodada (inferência, evidência e ranking versionado)
- 2026-03-06: handoff para gerador de propostas fechado como pacote único por insight (`insight` + `evidences[]` + `ranking` + `handoff_context` + `ready_for_solution=true`)


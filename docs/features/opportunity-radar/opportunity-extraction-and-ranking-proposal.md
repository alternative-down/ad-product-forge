# Proposta de Feature — Extração, Enriquecimento e Priorização de Oportunidades

## Status
Draft refinado (estrutura de processos definida)

## 1) Objetivo da feature
Transformar dados brutos coletados em oportunidades comparáveis e priorizáveis, com contexto suficiente para tomada de decisão.

Esta feature cobre o ciclo:
1. extrair sinais relevantes (dor/desejo/entretenimento/necessidade latente)
2. categorizar
3. enriquecer com metadados de contexto e peso
4. ranquear
5. controlar ciclo de vida das oportunidades (usada, não usada, reciclar, renovar)

---

## 1.1) Estrutura de processos (definida)
A proposta foi consolidada em três processos principais e separados:

1. **Processo de Base de Insumos**
   - recebe coletas ativas e passivas
   - deduplica entradas repetidas ou redundantes
   - mantém registro bruto consolidado e rastreável

2. **Processo de Enriquecimento no Grafo (agente item-a-item)**
   - executa em ciclos periódicos
   - cada novo item da base passa individualmente por um agente de análise
   - o agente registra categoria, contexto e relações com itens já existentes
   - as relações ficam em um memory graph semântico para conectar sinais dispersos

3. **Processo de Mineração Sob Demanda (agente minerador)**
   - acionado quando queremos extrair oportunidades do conjunto atual
   - opera em dois modos:
     - **Exploração livre (bottom-up)**: descobre padrões emergentes
     - **Investigação guiada por hipótese (top-down)**: busca sinais para contextos/problemas específicos

---

## 2) Escopo
### Dentro do escopo
- Processar entradas heterogêneas (estruturadas ou não)
- Consolidar sinais explícitos e implícitos
- Gerar objetos de oportunidade padronizados
- Produzir ranking para priorização
- Registrar estado e histórico de decisão por oportunidade

### Fora do escopo
- Implementação de coleta em fonte específica
- Desenvolvimento técnico de produto
- Validação comercial detalhada

---

## 3) Entradas (inputs)
A feature recebe blocos de dados brutos contendo, quando disponível:
- conteúdo textual (post, comentário, relato, ticket, conversa)
- origem/fonte
- momento temporal
- contexto mínimo da situação
- sinais de interação (quando houver)

As entradas vêm de dois canais:
- **Coleta ativa**: exploração deliberada de mercado/comunidades (ex.: firecrawl e outros meios)
- **Coleta passiva**: endpoint de ingestão que recebe eventos de múltiplas fontes do sistema e dos apps gerados

Regra de entrada:
- armazenar bruto
- deduplicar
- aplicar apenas estruturação mínima inicial

Schema mínimo de entrada (fixo):
- `item_id`
- `source_type`
- `source_name`
- `captured_at`
- `content_raw`
- `content_hash`
- `origin_ref`
- `processing_status`

Campo dinâmico:
- `metadata_json` (contexto e dados adicionais por fonte/coleta)

---

## 4) Estrutura de saída (unidade de oportunidade)
Cada oportunidade deve sair com, no mínimo:
- **resumo da oportunidade**
- **tipo principal de tensão**: dor, desejo, entretenimento, necessidade latente
- **categoria funcional** (ex.: onboarding, automação, suporte, conteúdo, etc.)
- **contexto de uso** (quem, quando, em que cenário)
- **evidências associadas** (trechos/fontes que sustentam)
- **metadados de peso**
- **pontuação final de prioridade**
- **status no ciclo de vida**

---

## 5) Processamento conceitual
### Etapa A — Entrada e consolidação de insumos
- receber dados ativos e passivos
- deduplicar e consolidar no repositório de insumos
- manter histórico de origem

### Etapa B — Enriquecimento semântico no grafo
- processar novos itens individualmente
- extrair sinais explícitos e implícitos
- classificar por tipo de tensão (dor/desejo/entretenimento/latente)
- conectar com contexto, rotina e registros relacionados

### Etapa C — Validação de qualidade do enriquecimento (duplo-agente)
- **Agente Analista** propõe categoria, relações e contexto
- **Agente Revisor** valida/ajusta inconsistências antes de consolidar
- saída consolidada entra no grafo como “registro validado”

### Etapa D — Mineração sob demanda
- executar consultas exploratórias (bottom-up)
- executar consultas orientadas por hipótese (top-down)
- extrair padrões, lacunas e oportunidades complementares

### Etapa E — Consolidação de oportunidades
- unir sinais convergentes
- formar oportunidades únicas e comparáveis

### Etapa F — Pontuação e priorização
- aplicar pontuação determinística
- gerar ranking e status de decisão

---

## 6) Modelo de análise e pontuação (conceitual)
A pontuação deve ser **determinística** e em duas fases:

### Fase 1 — Score de evidência
Avalia a força do sinal observado:
- intensidade da tensão
- frequência/recorrência
- abrangência
- clareza do problema/necessidade
- confiabilidade da evidência

### Fase 2 — Score de viabilidade/fit
Avalia se vale atuar agora:
- viabilidade de atendimento
- complexidade relativa
- aderência ao momento estratégico
- potencial de valor percebido

### Resultado final
- nota consolidada
- justificativa curta
- decisão inicial de status:
  - **Priorizar**
  - **Delayed** (revisitar depois)
  - **Descartar**

---

## 7) Controle de ciclo de vida das oportunidades
Cada oportunidade precisa de estado e histórico.

### Estados sugeridos
- **Novo**
- **Em análise**
- **Priorizado**
- **Em uso** (entrou em iniciativa/projeto)
- **Delayed**
- **Descartado**
- **Arquivado**
- **Reciclar/Reavaliar**
- **Renew/Recarregar evidência** (coletar sinais novos para atualizar confiança)

### Regras de controle
- toda mudança de estado deve ter motivo registrado
- oportunidades antigas sem evidência recente entram em revisão (renew)
- oportunidades rejeitadas podem voltar via reciclagem quando surgirem novos sinais

---

## 8) Saídas de gestão
A feature deve produzir visões objetivas para decisão:
1. Top oportunidades atuais
2. Oportunidades emergentes (subindo rápido)
3. Oportunidades estagnadas (sem evidência nova)
4. Oportunidades já usadas vs não usadas
5. Fila de reciclagem/renew

---

## 9) Critérios de qualidade da feature
A feature é considerada útil quando:
- reduz ruído e aumenta clareza das oportunidades
- permite comparar oportunidades de forma consistente
- mantém rastreabilidade da evidência
- evita perder oportunidades boas por falta de acompanhamento
- facilita decidir o que entra na próxima iniciativa

---

## 10) Perguntas abertas para refinamento
- Quais categorias funcionais padrão queremos adotar na V1?
- Como definir limiar de “evidência suficiente” para priorizar?
- Qual janela de tempo para marcar oportunidade como “stale” e pedir renew?
- Qual cadência de revisão do ranking?

---

## 11) Atualizações desta rodada
- Processo dividido em base de insumos + enriquecimento no grafo + mineração sob demanda
- Enriquecimento com modelo de duplo-agente (analista e revisor)
- Mineração com dois modos: exploração livre e investigação guiada por hipótese
- Pontuação definida em duas fases (evidência + viabilidade/fit)
- Status de decisão explícitos: priorizar, delayed, descartar

# Proposta de Feature — Extração, Enriquecimento e Ranking de Oportunidades

## Status
Definição funcional fechada (V1)

## 1) Objetivo
Transformar dados brutos em insights ranqueados e rastreáveis para alimentar a etapa posterior de propostas de solução.

---

## 2) Escopo
### Dentro do escopo
- Ingestão e consolidação de insumos ativos/passivos
- Enriquecimento semântico no grafo
- Mineração de insights
- Pontuação e ranking
- Handoff estruturado para etapa posterior

### Fora do escopo
- Escolha de stack final
- Implementação técnica detalhada
- Viabilidade de solução (fase posterior)

---

## 3) Entradas (insumos)
### Campos mínimos
- `timestamp`
- `content`
- `link` (opcional para entradas passivas)
- `context`

### Regras de entrada
- Armazenar bruto
- Aplicar deduplicação interna
- Manter ingestão simples com o mínimo de campos

---

## 4) Processos
1. **Base de insumos**
   - recebe ativo + passivo
   - aplica deduplicação interna

2. **Enriquecimento no grafo**
   - cada novo insumo gera 1 job (trigger/bull)
   - processamento por item (1 job = 1 item)
   - processador do job: agente LLM
   - agente analisa e conecta contexto/rotina/tensão
   - agente revisor valida consistência
   - manipulação do grafo em Neo4j (com embeddings em nós/arestas + fulltext BM25)
   - construção contínua de grafo de conhecimento com:
     - relações semânticas
     - categorização
     - evidências vinculadas
   - estrutura definida pelos agentes (sem schema semântico rígido nesta fase)

3. **Mineração de insights**
   - execução diária
   - acionamento em cascata por processo posterior
   - modos: bottom-up e top-down
   - foco da extração: dores/problemas/desejos/oportunidades
   - não gera ideias de produto nessa fase
4. **Pontuação e ranking**
   - ranking de força de insight (sem viabilidade)

---

## 5) Saída do minerador
A saída desta fase são insights de tensão de usuário/mercado (não ideias de produto).

## 5.1 Lista consolidada de problemas extraídos (saída mínima)
Cada item contém:
- `problem`
- `context`
- `graph_node_ref`

Observação:
- insights novos são mesclados nessa lista consolidada.
- saída externa do minerador fica apenas nesses três campos.
## 5.2 Pontuação
- `insight_id`
- `rank_score`
- `rank_reason`

---

## 6) Fórmula de pontuação (V1)
`rank_score = 0.35*evidence_strength + 0.30*recurrence + 0.20*pain_intensity + 0.15*context_breadth`

Escala:
- todos os critérios em 0–100 antes da ponderação

### Definições operacionais dos critérios
- `evidence_strength`: força combinada de evidências ligadas ao insight no grafo (consistência + convergência)
- `recurrence`: recorrência do padrão em insumos distintos conectados ao insight
- `pain_intensity`: intensidade de tensão inferida (dor/desejo/oportunidade)
- `context_breadth`: diversidade de contextos/atores onde o mesmo padrão aparece

---

## 7) Handoff para proposta de solução
Pacote por item da lista:
- `problem`
- `context`
- `graph_node_ref`
- `ranking`
- `handoff_context`
- `ready_for_solution = true`

---

## 8) Premissas finais desta feature
- Sem taxonomia fixa na V1 (emergente por agentes)
- Sem limiar de entrada no ranking
- Insight é criado uma vez (imutável)
- Sem versionamento histórico nesta fase
- Viabilidade fica para fase posterior

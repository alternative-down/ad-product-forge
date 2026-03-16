# PRD — Sistema Autônomo de Descoberta e Desenvolvimento de Produtos

**Status:** Draft - Em construção
**Data:** 2026-03-07
**Versão:** 0.1

---

## 📋 Visão Executiva

**Objetivo:** Construir uma empresa digital operada por agentes LLMs que funciona de forma **100% autônoma**, do descobrimento de oportunidades até o lançamento e operação de produtos.

**Proposta de valor:** Reduzir fricção na descoberta de problemas reais de mercado e execução de soluções, permitindo criação rápida de múltiplos micro-SaaS com validação contínua.

**Escopo:** Sistema fim-a-fim que:
1. Coleta sinais de mercado (ativo + passivo)
2. Enriquece e organiza semanticamente (grafo de conhecimento)
3. Extrai e ranqueia oportunidades
4. Gera propostas de valor acionáveis
5. Cria landing pré-solução para validação
6. Gera documentação de projeto
7. Executa desenvolvimento autônomo
8. Valida em staging
9. Lança em produção
10. Monitora e itera com feedback

---

## 🏗️ Arquitetura Conceitual

```
COLETA (ativa + passiva)
    ↓
ENRIQUECIMENTO (grafo semântico + embeddings)
    ↓
MINERAÇÃO (extração de insights/problemas)
    ↓
RANKING (priorização por critérios)
    ↓
PROPOSTA DE VALOR (análise de fit + estimativas)
    ↓
IDEAÇÃO (documentação + landing)
    ↓
PRÉ-SOLUÇÃO (coleta de leads + validação)
    ↓
DESENVOLVIMENTO (execução autônoma de tarefas)
    ↓
STAGING (testes e validação)
    ↓
PRODUÇÃO (lançamento e operação)
    ↓
CICLO DE PORTFÓLIO (decisão de nova rodada)
```

---

## 🔄 Fluxo Completo por Fase

### Fase 1: Coleta de Sinais

**Responsabilidade:** Agentos de coleta (firecrawl) + endpoints de ingestão

**Entradas:**
- Coleta ativa: Exploração orientada por prompt em fontes definidas + descoberta de fontes relacionadas
- Coleta passiva: Endpoint de ingestão de eventos/dados de sistemas terceiros
- Hooks externos: Integrações com sistemas financeiros, email, etc.

**Schema mínimo por insumo:**
- `timestamp` (ISO 8601)
- `content` (texto bruto do sinal)
- `link` (opcional, fonte do sinal)
- `context` (metadados: origem, tipo, autor, categoria inicial)

**Saída:**
- Registro persistente de insumos brutos
- Deduplicação interna aplicada
- Enfileiramento para processamento (1 job por insumo)

**ITENS EM ABERTO:**
- [ ] Definição de fontes iniciais para coleta ativa
- [ ] Protocolo de autenticação para endpoints de ingestão
- [ ] Quotas de coleta (limite diário/horário?)
- [ ] Política de retenção de dados brutos

---

### Fase 2: Enriquecimento Semântico (Grafo)

**Responsabilidade:** Agentes de enriquecimento + engine de grafo

**Entrada:**
- Insumo bruto (schema mínimo)

**Processamento:**
1. Estruturação do insumo
2. Extração de entidades (conceitos, atores, ações)
3. Geração de embeddings por nó/aresta
4. Relacionamento com conhecimento existente (busca semântica + fulltext)
5. Criação/atualização de nós e arestas no grafo
6. Indexação fulltext (BM25)

**Banco de Dados:** Neo4j
- Estrutura emergente (sem ontologia fixa na V1)
- Nós: conceitos, problemas, soluções, atores, contextos
- Arestas: relações semânticas com pesos
- Embeddings em nós e arestas (dimensão: aberto)
- Índice fulltext para busca por palavra-chave

**Saída:**
- Nó/aresta criados no grafo
- Referência ao nó criado para handoff posterior

**ITENS EM ABERTO:**
- [ ] Dimensão de embeddings (768? 1536?)
- [ ] Modelo de embedding (OpenAI? Local?)
- [ ] Política de deduplicação de nós (como identificar "mesmo conceito"?)
- [ ] Estrutura de pesos em arestas (escala, normalização?)
- [ ] Política de limpeza/consolidação do grafo (quando mesclar nós?)

---

### Fase 3: Mineração de Problemas/Oportunidades

**Responsabilidade:** Agentes mineradores + engine de mineração

**Gatilho:** Execução diária (horário: aberto) ou acionamento em cascata

**Modos de mineração:**
- **Bottom-up:** Exploração livre do grafo → descoberta de padrões emergentes
- **Top-down:** Busca orientada por tópicos/categorias predefinidas

**Processo:**
1. Consultar grafo de conhecimento
2. Extrair problemas/dores/desejos/oportunidades implícitas
3. Estruturar achados com contexto associado
4. Gerar referência para nó no grafo

**Modelo conceitual de sinal:**
```
Contexto (situação/ambiente)
  ↓
Rotina (comportamento atual)
  ↓
Tensão (dor/desejo/entretenimento)
  ↓
Problema (nomeável ou latente)
```

**Saída (Lista Consolidada):**
```json
[
  {
    "problem_id": "uuid",
    "problem": "descrição do problema",
    "context": {
      "fonte": "comunidade X",
      "audiência": "dev junior",
      "frequência": "recorrente",
      "severidade": "média"
    },
    "graph_node_ref": "node-uuid-no-grafo",
    "signal_strength": "0-100 (força da evidência)"
  }
]
```

**ITENS EM ABERTO:**
- [ ] Agendamento preciso (daily: que horário?)
- [ ] Critério de "força do sinal" (como quantificar?)
- [ ] Política de deduplicação de problemas extraídos
- [ ] Limite de problemas por rodada de mineração?
- [ ] Feedback loop: como sinais novos impactam re-ranking de problemas antigos?

---

### Fase 4: Ranking de Oportunidades

**Responsabilidade:** Agente ranqueador + engine de scoring

**Entrada:** Lista consolidada de problemas (Fase 3)

**Processo:**
1. Para cada problema:
   - Consultar grafo para sinais complementares
   - Calcular score multidimensional (0–100)
   - Registrar `rank_reason` (justificativa)

2. Score de oportunidade (proposta de ponderação):
   - `signal_strength`: 40% (força da evidência)
   - `audience_size`: 20% (tamanho potencial da audiência)
   - `urgency`: 20% (quão urgente é a necessidade)
   - `differentiation_potential`: 20% (espaço para solução única?)

**Saída:**
```json
{
  "problem_id": "uuid",
  "rank_score": 75,
  "rank_reason": "Sinal forte em comunidade X, 500+ menções em 2 meses, problema recorrente, espaço para diferenciação"
}
```

**Política:**
- Nenhum problema é excluído por score mínimo (todos entram para análise posterior)
- Ranking é contínuo (problemas podem subir/descer conforme novos sinais)

**ITENS EM ABERTO:**
- [ ] Pesos exatos da fórmula de score
- [ ] Como estimar `audience_size` automaticamente?
- [ ] Frequência de re-ranking (contínuo vs. periódico?)
- [ ] Histórico de scores (rastrear evolução?)

---

### Fase 5: Análise de Proposta de Valor

**Responsabilidade:** Agentes de análise + engine de viabilidade

**Gatilho:** Quando:
- Nenhum novo sistema em construção
- Apps em produção estáveis (< 10 issues/semana)
- Fluxo de caixa operacional (30d) >= 0

**Processo por rodada (batch):**

1. **Lote mínimo:** Analisar 3+ problemas (ou todos se < 3)
2. **Ordem:** FIFO (mais antigo primeiro)
3. **Para cada problema:**

   a. **Classificação:** Categorizar (dor, desejo, entretenimento, workflow)
   
   b. **Enriquecimento:** Consultar grafo para contexto complementar
   
   c. **Proposta inicial:** "O que seria uma solução mínima viável?"
   
   d. **Escopo:** Descompor em feature mínimas
   
   e. **Estimativas:**
      - Complexidade: 1–10
      - Feature count: N
      - Custo estimado (€ ou h): X
      - Potencial de receita (MRR): Y
      - Tempo estimado: T semanas
   
   f. **Validação de fit:**
      - ✅ Produto web?
      - ✅ Formato micro-SaaS?
      - ✅ Modelo: recorrência/crédito/one-time?
      - ✅ Suporte financeiro (runway)?
   
   g. **Decisão:** Propostar ou parquear

4. **Se propostar:** Gerar saída com métricas
5. **Se não fit:** Retornar problema ao final da fila para reanálise posterior

**Saída por proposta:**
```json
{
  "problem_id": "uuid",
  "problem": "...",
  "proposal": "Descrição da solução mínima viável",
  "features_min": ["feat1", "feat2", ...],
  "complexity": 6,
  "feature_count": 5,
  "estimated_cost_eur": 3500,
  "estimated_cost_hours": 140,
  "estimated_mrr_eur": 1200,
  "estimated_time_weeks": 4,
  "fit_web": true,
  "fit_saas": true,
  "fit_revenue_model": true,
  "fit_financial": true,
  "proposal_status": "proposed"
}
```

**Ranqueamento final da rodada:**
```
proposal_score = 
  0.35 * (estimated_mrr / 10000) +         // valor potencial (normalizado)
  0.25 * (1 - estimated_time_weeks / 12) + // rapidez (normalizado 0-12 semanas)
  0.20 * (1 - complexity / 10) +           // baixa complexidade
  0.20 * (1 - estimated_cost_eur / 10000)  // baixo custo (normalizado)
```

**Critério de desempate:**
1. Menor complexidade
2. Menor custo
3. Menor tempo estimado
4. FIFO (problema mais antigo)

**Transição de status do problema:**
```
new → queued → working → proposed (selecionado) → ideation
                     ↓ (não fit)
                   parked → queued (próxima rodada)
```

**ITENS EM ABERTO:**
- [ ] Valores exatos dos pesos na fórmula (é 0.35/0.25/0.20/0.20?)
- [ ] Normalização: como calibrar divisores (10000, 12, 10)?
- [ ] Dados de entrada: como agente estima custo/complexidade? (ML? heurística? prompt?)
- [ ] Feedback loop: quando proposta é aceita/rejeitada, isso refina futuras estimativas?
- [ ] Histórico de propostas (rastrear todas?)

---

### Fase 6: Ideação e Preparação de Projeto

**Responsabilidade:** Agentes de ideação + documentação

**Entrada:**
- Proposta selecionada (problema + solução + métricas)
- Contexto enriquecido do grafo

**Processo:**
1. Consolidar problema + proposta + contexto
2. Gerar documentação inicial do projeto:
   - **Overview:** Visão geral do produto
   - **Briefing:** Resumo executivo da oportunidade
   - **PRD:** Requirements detalhado
   - **Feature list:** Features mínimas + roadmap futuro
   - **Arquitetura inicial:** Stack, organização de código, integrações

3. Criar repositório de projeto:
   - Clonar a partir de template
   - Linkado com remoto (GitHub/GitLab)
   - Documentação colocada no repo

4. Gerar landing pré-solução:
   - Focada na dor identificada
   - Coleta de leads interessados
   - Form de cadastro

**Saída:**
- Repositório de projeto criado e documentado
- Landing pré-solução ativa
- Status marcado como `ideation`

**ITENS EM ABERTO:**
- [ ] Template de repositório de projeto (estrutura padrão)
- [ ] Template de landing page (como gerar?)
- [ ] Hospedagem de landing pré-solução (onde?)
- [ ] Integrações para coleta de leads (email, Zapier?)

---

### Fase 7: Pré-Solução (Validação de Leads)

**Responsabilidade:** Agentes de contato + coleta de informações

**Entrada:**
- Landing pré-solução com base de leads
- Documentação inicial do projeto

**Processo:**
1. Agentes em contato com leads interessados
2. Coletar informações adicionais:
   - Validação da dor/urgência
   - Requisitos específicos
   - Budget/disposição de pagar
   - Timeline esperada
3. Enviar status reports conforme evolução do projeto
4. Convidar para beta testing quando apropriado
5. Aplicar incentivos quando aplicável (desconto, período gratuito, créditos)
6. Registrar feedback e insights

**Saída:**
- Base de leads enriquecida
- Insights adicionais para refinamento de features
- Comprometimento inicial para beta testing
- Histórico de comunicações

**ITENS EM ABERTO:**
- [ ] Cadência de contato (quando/como agentes contatam?)
- [ ] Métricas de sucesso (qual % de leads converte para beta?)
- [ ] Compensação/incentivos (quanto oferecer de desconto?)
- [ ] Tratamento de objeções (como agentes lidam com "não"?)

---

### Fase 8: Planejamento de Desenvolvimento

**Responsabilidade:** Agentes de planejamento + engine de decomposição

**Entrada:**
- Features mínimas (PRD)
- Arquitetura inicial
- Estimativas de complexidade

**Processo:**
1. Descompor features em tarefas granulares
2. Estimar tempo/esforço por tarefa
3. Identificar dependências
4. Gerar plano sequencial
5. Criar issues no repositório (uma por tarefa)
6. Ordenar por prioridade/dependência

**Política:**
- Se tarefa > 3 dias: decompor em subtarefas
- Estimar com margem de segurança (conservador)
- Rastrear complexidade/risco por tarefa

**Saída:**
- Plano de desenvolvimento estruturado
- Issues criadas no repositório (com labels, assignees, milestones)
- Roadmap claro até MVP

**ITENS EM ABERTO:**
- [ ] Critério de "tamanho máximo" de tarefa
- [ ] Margem de segurança nas estimativas (qual %?)
- [ ] Alocação de agentes (quem executa cada tarefa?)

---

### Fase 9: Execução de Desenvolvimento

**Responsabilidade:** Agentes de desenvolvimento (via Mastra + picks do Automaker)

**Entrada:**
- Issues do plano de desenvolvimento
- Repositório com documentação

**Processo:**
1. Selecionar tarefa da fila (FIFO ou prioridade)
2. Executar implementação da tarefa:
   - Checkout de branch de feature
   - Desenvolvimento do código
   - Testes locais
   - Commit e push
   - Criação de PR

3. Validação:
   - Code review (automatizado + humano se necessário?)
   - Testes passam?
   - Documentação atualizada?

4. Merge e próxima tarefa

5. Registrar progresso:
   - Tempo real gasto vs. estimado
   - Bloqueadores encontrados
   - Melhorias futuras

**Saída:**
- Código em branches de feature
- PRs com testes e documentação
- Issues marcadas como completas
- Feedback contínuo de progresso

**ITENS EM ABERTO:**
- [ ] Stack tech (tech decision: qual framework? linguagem? banco de dados?)
- [ ] Política de review (automatizado? humano? ambos?)
- [ ] CI/CD pipeline (testes, linting, build?)
- [ ] Tempo de feedback (como agentes sabem que uma tarefa foi rejeitada?)

---

### Fase 10: Staging (Validação e Testes)

**Responsabilidade:** Agentes de QA + deployment

**Entrada:**
- Código completo (main branch)
- Testes passando localmente
- Documentação atualizada

**Processo:**
1. Deploy em ambiente de staging
2. Agentes executam testes em staging:
   - Testes manuais de funcionalidades
   - Testes de integração
   - Teste de performance
   - Teste de segurança (básico)
3. Agentes simulam produção:
   - Comportamento de usuários reais
   - Casos extremos e erros
4. Problemas encontrados:
   - Criar issues/bugs
   - Retornar para desenvolvimento
5. Iterate até estabilização

**Critério de saída:** "Estável = sem erros críticos por 24h de operação"

**Saída:**
- Ambiente de staging validado
- Issues de bugs resolvidas
- Produção pronta para deploy

**ITENS EM ABERTO:**
- [ ] Duração mínima em staging (quantas horas/dias?)
- [ ] Teste de carga (quantos usuários simultâneos testar?)
- [ ] Integração com produção anterior (se houver)
- [ ] Plano de rollback

---

### Fase 11: Produção (Lançamento e Operação)

**Responsabilidade:** Agentes de operação + deployment

**Entrada:**
- Sistema validado em staging
- Documentação completa
- Landing page com leads

**Processo:**
1. Deploy em produção
2. Ativação de base de conhecimento:
   - Documentação
   - FAQs
   - Guias de uso
3. Iniciar operação:
   - Suporte autônomo aos usuários
   - Monitoramento de erros
   - Coleta de feedback
4. Notificar leads sobre lançamento
5. Iniciar beta testing com interessados

**Stack padrão de operação:**
- Observabilidade: métricas + logs + eventos contextuais
- Canais de suporte: embedded no app + email
- Agentes de suporte: acesso a docs + repositório
- Issue auto-creation: problemas em log → issues automáticas
- Feedback loop: user feedback → issues

**Saída:**
- Produto em operação
- Base de usuários inicial (leads convertidos)
- Dados de operação capturados

**ITENS EM ABERTO:**
- [ ] SLA de resposta (qual tempo para suporte responder?)
- [ ] Política de feature requests (como capturar ideias de usuários?)
- [ ] Escalabilidade inicial (quanto tráfego suportar?)
- [ ] Backup/disaster recovery

---

### Fase 12: Feedback Contínuo e Ciclo de Portfólio

**Responsabilidade:** Agentes de operação + análise

**Monitores em produção:**
- Métrica técnicas: uptime, latência, erros
- Métrica de negócio: MRR, churn, CAC, LTV
- Feedback de usuários: issues, sugestões, reviews
- Saúde do sistema: bloqueadores, problemas

**Acionamento de nova rodada de produto (gatilho):**
Quando **TODOS** os critérios forem satisfeitos:
- ✅ Fluxo de caixa operacional (últimos 30d) >= 0
- ✅ Runway projetado >= 3 meses
- ✅ Apps em produção estáveis (< 10 issues/semana)
- ✅ MRR atual >= 1.15x média dos 2 meses anteriores

Quando acionado:
- Retornar à Fase 1 com novo ciclo de coleta
- Manter apps atuais com manutenção mínima
- Alocação: XX% para novo produto, XX% para manutenção

**ITENS EM ABERTO:**
- [ ] Exato de "estável" (< 10 issues/semana = qual severidade?)
- [ ] Percentual de alocação de agentes (novo vs. manutenção)
- [ ] Quando deprecar produtos (critério de saída?)

---

## 🤖 Modelo de Agentes

### Agentes por Fase

| Fase | Agente | Responsabilidade | Dependência |
|------|--------|-------------------|-------------|
| 1 | Coletor (Firecrawl) | Coleta ativa em fontes | Sistema de coleta |
| 1 | Ingressor | Ingestão passiva de eventos | API de ingestão |
| 2 | Enriquecedor | Enriquecimento semântico | Neo4j + embeddings |
| 3 | Minerador | Extração de problemas | Grafo |
| 4 | Ranqueador | Scoring de oportunidades | Grafo + histórico |
| 5 | Analista de Valor | Proposta + viabilidade | Estimativas |
| 6 | Documentador | Geração de projeto | Templates + docs |
| 7 | Contator | Coleta de leads | Landing + base de contatos |
| 8 | Planejador | Decomposição de features | PRD + estimativas |
| 9 | Desenvolvedor | Execução de código | Mastra + Automaker |
| 10 | Testador | Validação em staging | Ambiente de staging |
| 11 | Operador | Suporte + operação | Sistema em produção |
| 12 | Analista de Ciclo | Decisão de nova rodada | Métricas |

### Comunicação Entre Agentes

**Modelo:**
- Assíncrono via fila de jobs (BullMQ/Trigger)
- Cada agente possui sua própria thread de contexto
- Resposta esperada em até 5 minutos (com timeout fallback)
- Injeta replies como mensagens na thread durante execução

**ITENS EM ABERTO:**
- [ ] Protocolo exato de comunicação (formato de payload)
- [ ] Tratamento de timeouts e retries
- [ ] Logging de comunicação entre agentes

---

## 📊 Infraestrutura e Stack

**Definido:**
- Grafo de conhecimento: **Neo4j**
- Orquestrador de jobs: **BullMQ ou Trigger** (decision pending)
- Fila de execução: Nativa do orquestrador
- Agentes de desenvolvimento: **Mastra** + picks do Automaker
- Runtime: Node.js + TypeScript

**Em aberto (decision pending):**
- [ ] Banco de dados principal (PostgreSQL? MongoDB?)
- [ ] Cache (Redis? Memcached?)
- [ ] Message queue para coleta ativa (Kafka? RabbitMQ?)
- [ ] Observabilidade (Datadog? New Relic? Self-hosted?)
- [ ] Hosting (AWS? GCP? Self-hosted VPS?)
- [ ] Docker orchestration (Kubernetes? Docker Compose?)

**Decisão de timing:** Stack tecn será definido na fase de documentação técnica/arquitetura (não antecipadamente).

---

## 📈 Métricas e KPIs

### Métricas de Descoberta
- Insumos coletados por período
- Problemas extraídos por período
- Taxa de conversão (problema → proposta)
- Taxa de conversão (proposta → ideação)

### Métricas de Produto
- Tempo de ciclo (problema → produção)
- Custo real vs. estimado
- MRR por produto
- Churn rate
- CAC (Customer Acquisition Cost)
- LTV (Lifetime Value)

### Métricas de Operação
- Uptime dos sistemas
- MTTR (Mean Time To Recovery)
- Issues por semana por app
- Taxa de resolução de suporte

### Métricas de Saúde Financeira
- Fluxo de caixa (semanal/mensal)
- Runway (projetado)
- Taxa de crescimento de MRR
- Custo operacional total

**ITENS EM ABERTO:**
- [ ] Dashboard de métricas (como visualizar?)
- [ ] Alertas automáticos (quando disparar?)
- [ ] Dados para feedback de agentes (como agentes veem métricas?)

---

## 🔓 Itens Abertos por Categoria

### Arquitetura & Infraestrutura
- [ ] Stack tecn final (banco, cache, message queue, hosting)
- [ ] Protocolo de comunicação entre agentes (contrato de payload)
- [ ] Política de retry/falha (backoff strategy)
- [ ] Dimensão de embeddings e modelo de embedding
- [ ] Schema de Neo4j (tipos de nós/arestas)

### Coleta & Enriquecimento
- [ ] Fontes iniciais para coleta ativa
- [ ] Protocolo de ingestão passiva (autenticação, rate limits)
- [ ] Quotas de coleta (limites?)
- [ ] Política de deduplicação (nó vs. nó)
- [ ] Cronograma de mineração (que horário? frequência?)

### Análise & Ranking
- [ ] Pesos exatos na fórmula de score
- [ ] Normalização de métricas (divisores)
- [ ] Como agentes estimam custo/complexidade? (ML vs. heurística)
- [ ] Feedback loop (como propostas rejeitadas refinam futuras estimativas)
- [ ] Frequência de re-ranking

### Implementação & Deployment
- [ ] Template de repositório de projeto
- [ ] Template de landing pré-solução
- [ ] Hospedagem de landing (onde?)
- [ ] Integrações para coleta de leads (email, form provider)
- [ ] CI/CD pipeline detalhado (testes, linting, build)
- [ ] Política de code review (automatizado? humano?)

### Operação & Suporte
- [ ] SLA de resposta de suporte
- [ ] Política de feature requests
- [ ] Capacidade de escalabilidade inicial
- [ ] Backup/disaster recovery
- [ ] Integração com feedback de usuários

### Métricas & Observabilidade
- [ ] Dashboard de métricas (ferramenta?)
- [ ] Alertas automáticos (critérios?)
- [ ] Como agentes acessam métricas?

### Timing & Gatilhos
- [ ] Horário exato de mineração diária
- [ ] Duração mínima em staging
- [ ] Alocação de agentes (novo vs. manutenção) quando nova rodada acionada
- [ ] Critério de deprecação de produtos

---

## 🚀 Fases de Implementação Proposta

### Fase Alpha (Sprint 1-2)
- Coleta básica (ativa + passiva)
- Enriquecimento em grafo
- Mineração e ranking simples
- Dashboard de monitoramento

### Fase Beta (Sprint 3-4)
- Análise de proposta de valor
- Ideação e documentação
- Planejamento de desenvolvimento
- Landing pré-solução

### Fase Gamma (Sprint 5-6)
- Execução de desenvolvimento autônomo
- Staging e validação
- Lançamento em produção
- Suporte inicial

### Fase Delta (Sprint 7+)
- Feedback contínuo
- Ciclo de portfólio
- Escalabilidade
- Múltiplos produtos em paralelo

---

## 📝 Próximos Passos

1. **Revisão técnica:** Converter decisões de "stack pending" em seleções concretas
2. **Especificação de APIs:** Definir contratos de payload entre agentes
3. **Design de templates:** Criar templates para repos e landing pages
4. **Prototipagem:** Implementar Fase 1 (coleta) como proof of concept
5. **Testes:** Validar cada fase com dados reais antes de escalar

---

## 📚 Referências

- `docs/system/autonomous-system-overview.md` — Visão geral arquitetural
- `docs/features/*` — Detalhamento por feature
- `docs/notes/*` — Anotações de decisões em aberto

---

**Última atualização:** 2026-03-07
**Próxima revisão:** Após discussão com Nicolas sobre itens abertos

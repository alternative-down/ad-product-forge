# Proposta de Feature — Extração, Enriquecimento e Priorização de Oportunidades

## Status
Draft

## 1) Objetivo da feature
Transformar dados brutos coletados em oportunidades comparáveis e priorizáveis, com contexto suficiente para tomada de decisão.

Esta feature cobre o ciclo:
1. extrair sinais relevantes (dor/desejo/entretenimento/necessidade latente)
2. categorizar
3. enriquecer com metadados de contexto e peso
4. ranquear
5. controlar ciclo de vida das oportunidades (usada, não usada, reciclar, renovar)

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

As entradas podem vir de:
- coleta ativa (exploração de mercado, comunidades, reviews, benchmark)
- coleta passiva (atendimento, solicitações, social, erros e limitações observadas em operação)

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
### Etapa A — Triagem
- separar ruído de material potencialmente útil
- agrupar conteúdos relacionados

### Etapa B — Extração
- identificar sinais explícitos e implícitos
- detectar padrões de rotina/comportamento quando houver

### Etapa C — Categorização
- classificar por tipo de tensão (dor/desejo/entretenimento/latente)
- classificar por domínio/contexto

### Etapa D — Enriquecimento por metadados
Adicionar metadados para interpretação e peso, como:
- força do sinal
- repetição/recorrência
- clareza de contexto
- potencial de ação
- grau de incerteza

### Etapa E — Consolidação
- unir sinais duplicados/semelhantes
- consolidar em oportunidades únicas e comparáveis

### Etapa F — Priorização
- aplicar critério de pontuação
- gerar ranking

---

## 6) Modelo de análise e pontuação (conceitual)
A prioridade de uma oportunidade deve refletir combinação de dimensões como:
- **intensidade da tensão** (quão forte é)
- **frequência** (quão recorrente é)
- **abrangência** (quantos contextos/pessoas afeta)
- **clareza do problema/necessidade**
- **potencial de execução**
- **potencial de valor percebido**
- **confiabilidade da evidência**

> Resultado: uma nota final + justificativa textual curta por oportunidade.

---

## 7) Controle de ciclo de vida das oportunidades
Cada oportunidade precisa de estado e histórico.

### Estados sugeridos
- **Novo**
- **Em análise**
- **Priorizado**
- **Em uso** (entrou em iniciativa/projeto)
- **Não usado (por enquanto)**
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

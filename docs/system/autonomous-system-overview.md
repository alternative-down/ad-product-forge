# Sistema Autônomo — Visão Geral

## Status
Draft

## Premissa global
Criar uma empresa digital operada por agentes LLMs, sem intervenção humana, funcionando de forma automática e coordenada.

Isso vale para o ciclo completo:
1. coleta de dados
2. enriquecimento e organização semântica
3. mineração e extração de oportunidades
4. priorização/ranking
5. análise de viabilidade
6. decisão de status
7. geração de propostas de solução
8. encaminhamento para execução

## Princípios operacionais
- **Autonomia fim-a-fim**: sem etapas manuais de aprovação.
- **Rastreabilidade**: cada decisão automática deixa trilha de evidência.
- **Revisão contínua**: oportunidades e decisões podem ser reavaliadas por novos sinais.
- **Estados explícitos**: itens percorrem status claros (priorizar, despriorizar, delayed, descartar, etc.).
- **Ciclo fechado de aprendizado**: dados de operação dos produtos alimentam novas decisões.
- **Controle financeiro mínimo**: empresa mantém caixa com visão simples de contas a pagar, contas a receber, custos e fluxo de caixa.

## Processo 1 (inicial) — Coleta ativa na internet
- Um agente de coleta (firecrawl) recebe um prompt com:
  - locais iniciais sugeridos
  - instrução para explorar também novos lugares relacionados
- Retorno esperado da coleta ativa:
  - link do conteúdo
  - conteúdo bruto
  - contexto adicional da coleta
- Esses dados são registrados localmente.
- A mesma estrutura também pode chegar por endpoint de ingestão (canal passivo para outras fontes).
- Cada novo insumo registrado dispara 1 job (trigger/bull), processado por agente LLM.
- Objetivo: ampliar a descoberta de sinais além da lista inicial, com exploração guiada.

## Base semântica do sistema
- Grafo em Neo4j
- Embeddings em nós e arestas
- Busca fulltext com BM25
- Grafo de conhecimento construído continuamente pelos agentes (relações, categorização, evidências)

## Papel dos agentes LLM no sistema
- agentes de coleta/interpretação
- agentes de enriquecimento e relacionamento semântico
- agentes mineradores (exploração livre e guiada)
- agentes de categorização e proposta de valor
- agentes de análise de viabilidade

## Processo posterior (quando operação estiver estável)
- Condição: sem novo sistema em construção e apps em produção estáveis.
- O agente percorre a lista consolidada de problemas extraídos.
- Para cada problema:
  - usa o `context` do item
  - pode consultar o grafo para relações e sinais complementares
  - produz uma proposta de valor
  - analisa o que precisa ser feito para atender a proposta
  - estima custo e esforço para atendimento

## Papel das regras determinísticas
- pontuação/ranking consistente
- transições de estado com critérios claros
- redução de variabilidade entre execuções

## Diretriz de definição de stack
- Não definir stack antecipadamente durante a fase de planejamento funcional/conceitual.
- Toda tecnologia (fila, orquestrador, banco, framework, etc.) deve ficar registrada como **opção a avaliar**.
- A escolha oficial de stack ocorre apenas na etapa de documentação técnica/arquitetural.

## Observação
Esta premissa (100% autônomo) deve ser aplicada como base em todas as features do sistema.

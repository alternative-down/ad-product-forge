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
- Objetivo: ampliar a descoberta de sinais além da lista inicial, com exploração guiada.

## Papel dos agentes LLM no sistema
- agentes de coleta/interpretação
- agentes de enriquecimento e relacionamento semântico
- agentes mineradores (exploração livre e guiada)
- agentes de análise de viabilidade
- agentes de geração de proposta

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

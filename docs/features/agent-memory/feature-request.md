# Feature Request — Memória Isolada por Agente

## Status
Draft inicial

## Premissa
Cada agente possui sua própria memória isolada.

## Direção funcional
- memória combina abordagem do OpenClaw com padrão observacional semelhante ao Mastra
- modelo de gestão de memória/contexto será próprio do projeto
- agentes terão agendamento próprio (crons) e heartbeat para rotinas recorrentes

## Modelo de uso durante execução (step-by-step)
- durante um run, em cada step o agente faz:
  1) busca semântica na memória isolada do próprio agente
  2) busca fulltext (BM25) na mesma memória
  3) injeção do contexto recuperado antes do próximo step
- abordagem inspirada na ideia de memória observacional, com fluxo de injeção por step adaptado ao projeto

## Opções de base para memória e busca
- Neo4j
- sqlite-vec + fulltext BM25

## Observação
A escolha final entre as opções será definida mais adiante, na etapa técnica/arquitetural.

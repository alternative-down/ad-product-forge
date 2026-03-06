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
- agentes não acionam memória por tool explícita
- memória é criada e recuperada automaticamente pelo runtime
- em cada step, runtime faz recuperação semântica + fulltext (BM25) da memória isolada do agente
- memória recuperada é injetada no contexto como mensagem da thread (ex.: bloco `<memory>`)
- abordagem inspirada na ideia de memória observacional, com fluxo automático de injeção por step adaptado ao projeto

## Opções de base para memória e busca
- Neo4j
- sqlite-vec + fulltext BM25

## Observação
A escolha final entre as opções será definida mais adiante, na etapa técnica/arquitetural.

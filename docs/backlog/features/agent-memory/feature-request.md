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
- durante o run, runtime recupera memória existente (semântica + fulltext/BM25) e injeta no contexto como mensagem da thread (ex.: `<memory>`)
- criação/atualização de memória ocorre no fechamento da execução

## Momento de criação de memória
- ao finalizar o run, antes de devolver o resumo executivo para a thread primária
- nesse ponto, runtime consolida e grava memórias da execução recém-concluída
- também pode ocorrer durante o run quando houver necessidade de compactação de contexto
- regra: antes de compactar, construir/atualizar memória; depois executar a compactação

## Implementação de memória e busca
- Memória persistida com LibSQL
- Busca semântica com embeddings (FastEmbed)
- Busca fulltext com BM25

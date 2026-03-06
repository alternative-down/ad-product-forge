# Feature Request — Modelo de Execução de Agentes

## Status
Draft inicial

## Premissa de execução
- cada agente mantém uma thread única
- cada job dispara um run
- durante o run, mensagens da execução são empilhadas normalmente na thread de execução

## Modelo de execução por step
Durante o run:
1. executar step atual
2. runtime recupera memória do agente (semântica + fulltext/BM25)
3. runtime injeta memória recuperada como mensagem da thread (ex.: `<memory>`)
4. repetir até finalizar o run

Observação:
- não existe tool de memória acionada manualmente pelo agente.

## Modelo de fechamento do run
Ao concluir um run:
1. agente gera resumo executivo da execução
2. histórico detalhado do run é compactado/substituído
3. persistem apenas:
   - prompt inicial da execução
   - resumo executivo do run

## Estratégia de implementação sugerida (conceitual)
- clonar a thread principal para execução isolada
- processar o run na thread clonada
- ao final, devolver para a thread principal apenas o prompt inicial + resumo executivo

## Fila por agente
- cada agente possui sua própria fila de eventos/jobs
- jobs alimentam as execuções e suas ramificações

## Objetivo
Manter continuidade de contexto com thread única, evitando inchaço de histórico e preservando só o essencial por execução.

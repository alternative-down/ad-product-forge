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
2. runtime recupera memória do agente (semântica + fulltext)
3. runtime injeta memória recuperada como mensagem da thread
4. repetir até finalizar o run

Observação:
- memória é recuperada automaticamente; agentes não acionam tool de memória manualmente

## Modelo de fechamento do run
Ao concluir um run:
1. runtime cria/atualiza memórias da execução
2. agente gera resumo executivo da execução
3. histórico detalhado do run é compactado/substituído
4. persistem apenas:
   - prompt inicial da execução
   - resumo executivo do run

Ordem importante:
- criação de memória acontece antes da devolução do resumo executivo para a thread primária.
- em compactação durante execução: criar/atualizar memória antes de compactar o contexto.

## Estratégia de compactação de contexto
- durante a execução, histórico intermediário é compactado
- contexto preserva pontos relevantes: início, fim, e eventos importantes
- compactação ocorre antes de gravar memórias da execução

## Isolamento de contexto por execução
- cada execução (run) mantém seu próprio contexto isolado
- ao final, apenas prompt inicial e resumo executivo são preservados na thread principal
- histórico detalhado é compactado para manter contexto limpo

## Fila por agente
- cada agente possui sua própria fila de eventos/jobs
- jobs alimentam as execuções e suas ramificações
- mensagens entre agentes são eventos enviados para a fila do agente destino

## Comunicação assíncrona entre agentes
- envio de mensagem: assíncrono via fila do agente destino
- entre steps da execução, runtime verifica mensagens recebidas
- replies recebidas são injetadas no contexto/mensagens da execução

## Objetivo
Manter continuidade de contexto com thread única, evitando inchaço de histórico e preservando só o essencial por execução.

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
- regra de "mensagens do meio" vale para compactação da execução (run)
- compactação da memória primária segue fluxo normal
- na execução, compactação não precisa considerar toda a thread desde o início
- prioridade para compactar mensagens intermediárias (do meio), preservando bordas relevantes do contexto

## Estratégia de implementação sugerida (conceitual)
- clonar a thread principal para execução isolada
- processar o run na thread clonada
- ao final, devolver para a thread principal apenas o prompt inicial + resumo executivo

## Fila por agente
- cada agente possui sua própria fila de eventos/jobs
- jobs alimentam as execuções e suas ramificações
- mensagens entre agentes são eventos enviados para a fila do agente destino

## Comunicação assíncrona entre agentes
- envio de mensagem: assíncrono
- janela de espera por reply: até 5 minutos (configurável)
- se não houver reply no prazo, chamada retorna indisponibilidade temporária
- entre steps da execução, runtime verifica fila de entrada/replies
- reply recebido é injetado no contexto/mensagens da execução

## Objetivo
Manter continuidade de contexto com thread única, evitando inchaço de histórico e preservando só o essencial por execução.

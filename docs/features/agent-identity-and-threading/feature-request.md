# Feature Request — Identidade e Threading de Agentes

## Status
Draft inicial

## Regra base
Cada agente possui:
- persona
- nome
- email
- thread única

## Objetivo
Garantir identidade clara e continuidade de contexto por agente.

## Observação
A thread única é o canal principal de mensagens/contexto do agente.
Mensagens entre agentes chegam de forma assíncrona via fila e, quando recebidas, são incorporadas nessa thread/contexto de execução.

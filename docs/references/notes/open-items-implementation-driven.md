# Nota — Itens guiados por implementação

## Decisão atual

Alguns pontos ficam para fechamento durante implementação, pois dependem da arquitetura final dos agentes e do contexto real de execução.

## Itens

- contrato final de payload entre etapas (campos obrigatórios/idempotência)
- governança de comunicação entre agentes

## Fechado

- política de retry/falha de jobs autônomos: usar recurso nativo do orquestrador (BullMQ/Trigger) com backoff exponencial por job

## Observação

Esses pontos serão definidos junto da implementação conforme necessidade real.

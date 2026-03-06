# Feature Request — Modelo de Execução de Agentes

## Status
Draft inicial

## Premissa de execução
- cada agente mantém uma thread única
- execuções podem gerar ramificações dentro dessa thread (branches por execução)

## Fila por agente
- cada agente possui sua própria fila de eventos/jobs
- jobs alimentam as execuções e suas ramificações

## Objetivo
Manter continuidade de contexto com thread única, sem perder isolamento operacional entre execuções.

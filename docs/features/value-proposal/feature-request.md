# Feature Request — Geração de Proposta de Valor

## Status
Draft inicial

## Gatilho de execução
Executa quando:
- não há novo sistema sendo construído
- apps em produção estão estáveis

## Lote mínimo por rodada
- analisar no mínimo 3 problemas por rodada

## Entrada
- lista consolidada de problemas extraídos
- para cada item: `problem`, `context`, `graph_node_ref`

## Guias de fit (restrições)
A proposta precisa estar alinhada com:
- produto web
- formato micro-SaaS
- modelo de receita: recorrência, crédito ou one-time

## Processo
Para cada problema da fila (ordem FIFO):
1. classificar/categorizar o problema
2. usar o contexto do item
3. consultar o grafo (opcional) para relações e sinais adicionais
4. gerar proposta de valor
5. analisar o que precisa ser feito para atender a proposta
6. analisar custo e esforço para atendimento
7. validar fit da proposta com as capacidades/restrições da plataforma
8. validar suporte financeiro pelo fluxo de caixa da empresa

Se não encaixar no momento:
- problema volta para o final da fila para reanálise posterior

## Saída
- proposta de valor por problema
- análise do que é necessário para atendimento de cada proposta
- estimativa de custo e esforço para atendimento
- métricas numéricas por proposta, incluindo:
  - complexidade
  - quantidade de features
  - custo estimado
  - potencial de receita (MMR)

## Objetivo
Transformar problemas extraídos em propostas de valor acionáveis, mantendo o processo simples e autônomo.

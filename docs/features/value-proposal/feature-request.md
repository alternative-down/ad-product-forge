# Feature Request — Geração de Proposta de Valor

## Status
Draft inicial

## Gatilho de execução
Executa quando:
- não há novo sistema sendo construído
- apps em produção estão estáveis

## Entrada
- lista consolidada de problemas extraídos
- para cada item: `problem`, `context`, `graph_node_ref`

## Processo
Para cada problema da lista:
1. classificar/categorizar o problema
2. usar o contexto do item
3. consultar o grafo (opcional) para relações e sinais adicionais
4. gerar proposta de valor
5. analisar o que precisa ser feito para atender a proposta
6. analisar custo e esforço para atendimento

## Saída
- proposta de valor por problema
- análise do que é necessário para atendimento de cada proposta
- estimativa de custo e esforço para atendimento

## Objetivo
Transformar problemas extraídos em propostas de valor acionáveis, mantendo o processo simples e autônomo.

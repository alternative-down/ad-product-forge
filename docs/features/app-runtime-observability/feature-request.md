# Feature Request — Base de Observabilidade por App

## Status
Draft inicial

## Premissa
Todo app novo nasce com uma base padrão já incluída.

## Base padrão mínima
- métricas
- logging
- eventos de runtime com contexto adicional
- suporte embutido no app
- suporte via email

## Fluxo de eventos e suporte
1. eventos são disparados pela aplicação em execução
2. eventos chegam com contexto adicional suficiente para diagnóstico
3. agente LLM consulta os dados necessários
4. agente cria issues sobre os acontecimentos relevantes
5. issues entram na esteira padrão de desenvolvimento e CI/CD
6. tickets de suporte (in-app e email) são atendidos por agentes LLM
7. agentes de suporte têm acesso ao repositório e documentações
8. agentes usam busca semântica (embeddings) e fulltext (BM25) para auxiliar usuários
9. quando ticket vira problema acionável, entra na mesma esteira de desenvolvimento/CI-CD
10. agentes de suporte também podem acionar o criador de issues (mesmo mecanismo usado por eventos de runtime)

## Objetivo
Padronizar visibilidade operacional e transformar automaticamente sinais de runtime em backlog acionável.

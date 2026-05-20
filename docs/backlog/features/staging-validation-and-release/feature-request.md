# Feature Request — Validação em Staging e Liberação para Produção

## Status

Draft inicial

## Entrada

- tarefas do plano concluídas
- validações e testes locais concluídos

## Objetivo

Validar o sistema em ambiente de teste e só liberar produção após estabilização.

## Processo

1. Confirmar conclusão das tarefas + validação/testes locais
2. Fazer deploy em ambiente de teste (staging)
3. Agentes executam testes e resolução de problemas em staging, simulando produção
4. Quando staging estiver estável, liberar deploy para produção

## Saída

- sistema validado em staging
- ambiente de produção liberado e atualizado

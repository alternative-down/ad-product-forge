# Plano de Implementação Incremental: Memória e Contexto (Dois Níveis)

Este plano divide a construção da arquitetura de memória em fases menores e incrementais. Cada fase será executada, enviada ao GitHub e aguardará feedback antes de prosseguirmos.

## Fase 1: Fundação do Orquestrador e Thread Primária
**Objetivo:** Criar a estrutura básica para gerenciar a Thread Primária e automatizar o ciclo de Request/Response sem poluição de logs.

- [ ] Implementar `executeAutonomousCycle` no `@mastra-engine/core`.
- [ ] Lógica de salvar apenas Input/Output final na Thread Primária.
- [ ] Teste básico de persistência na Thread Primária usando a Factory.

## Fase 2: Ciclo de Execução Transient (Nível 2)
**Objetivo:** Implementar o isolamento da execução usando clonagem de threads.

- [ ] Integrar `memory.cloneThread()` no orquestrador.
- [ ] Garantir que o `generate` ocorra na thread clonada.
- [ ] Implementar o Cleanup automático da thread de execução após o ciclo.

## Fase 3: Sincronização de Estado (Working Memory)
**Objetivo:** Garantir que o "aprendizado" estruturado durante a execução persista na identidade do agente.

- [ ] Implementar lógica de extração do WM da thread de execução.
- [ ] Sincronizar o WM final de volta para a Thread Primária.
- [ ] Validar persistência do WM entre múltiplos ciclos de execução.

## Fase 4: Manutenção Programática (Observational Memory)
**Objetivo:** Ativar a compressão de longo prazo na Thread Primária sem iterações de ferramentas.

- [ ] Implementar a chamada manual ao `om.observe()` na Thread Primária após a consolidação.
- [ ] Configurar thresholds de observação e reflexão.
- [ ] Validar a geração de observações a partir do histórico consolidado.

## Fase 5: Hybrid Recall Processor (Mensagens + Workspace)
**Objetivo:** Criar o processador que injeta contexto dinâmico a cada passo da execução.

- [ ] Implementar o `HybridRecallProcessor` integrando `memory.recall` e busca no Workspace.
- [ ] Configurar injeção via hook `processInputStep`.
- [ ] Validar se o agente utiliza as informações injetadas durante tool-calls.

## Fase 6: Integração GraphRAG (Neo4j)
**Objetivo:** Alimentar e consultar o grafo de conhecimento semântico.

- [ ] Configurar driver Neo4j e conexão.
- [ ] Implementar hook `onReflectionEnd` no OM para injetar dados no grafo.
- [ ] Integrar busca no grafo dentro do `HybridRecallProcessor`.

---

**Próximo Passo:** Aguardando sinal verde para iniciar a **Fase 1**.

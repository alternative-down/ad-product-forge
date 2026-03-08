# Design de Contexto: Memória de Dois Níveis (V2 - Detalhado)

Esta especificação detalha a implementação técnica da gestão de contexto no motor **Mastra Engine**, focada em isolamento de execução e persistência de longo prazo via Observational Memory (OM) e GraphRAG.

## 1. Estrutura de Threads e Identificadores

Para garantir consistência e rastreabilidade, todos os identificadores são derivados do `agent.id`:

- **Primary Thread (Level 1):** `primary_${agent.id}`
- **Execution Thread (Level 2):** `exec_${agent.id}_${Date.now()}`
- **Storage Path:** `workspace_${agent.id}/`
- **Database:** `agent_${agent.id}.db` e `workspace_${agent.id}.db`

---

## 2. Comportamentos Verificados (Source Code Analysis)

### 2.1 Clonagem de Memória (OM)
O método `cloneThread()` do `@mastra/memory` realiza o mapeamento profundo de registros de Observational Memory. Quando clonamos a *Primary Thread* para a *Execution Thread*, o Nível 2 herda:
- Todas as **Observações** (resumos de médio prazo).
- Todas as **Reflexões** (resumos de longo prazo).
- O estado atual do **Working Memory**.

Isso garante que a execução transiente comece com o contexto completo do agente, sem carregar o peso de centenas de mensagens brutas.

### 2.2 Gatilho Programático do OM
Confirmamos que a classe `ObservationalMemory` possui o método público `observe()`. Isso permite que a Thread Primária seja mantida de forma assíncrona:
1.  Salvamos o par `Request/Response` final.
2.  Chamamos `om.observe({ threadId: primaryId })`.
3.  O Mastra avalia se o limite de tokens foi atingido e realiza a compressão, gerando novas observações.

### 2.3 Persistência do Working Memory
O Working Memory é persistente no banco de dados e associado ao par `threadId`/`resourceId`. Como a thread de execução é isolada, sincronizamos o estado final do WM manualmente para a Thread Primária ao fim do ciclo.

---

## 3. Fluxo de Implementação do Ciclo Autônomo

O orquestrador `executeAutonomousCycle` seguirá este fluxo lógico:

### Passo 1: Inicialização do Contexto
Verifica se a `primary_${agent.id}` existe. Se não, cria usando `memory.createThread()`.

### Passo 2: Isolamento (Nível 2)
Cria a thread transiente: `memory.cloneThread({ source: primaryId, newId: execId })`.

### Passo 3: Execução Híbrida
Chama `agent.generate()` na thread transiente com o `HybridRecallProcessor`.
- O processador busca mensagens relevantes no histórico da thread de execução.
- Injeta dados de GraphRAG e Workspace via hook `processInputStep`.

### Passo 4: Consolidação (Nível 1)
Persiste apenas o input inicial do usuário e a resposta final do agente na Thread Primária usando `memory.saveMessages()`.

### Passo 5: Sincronização de Estado
1.  Extrai o WM final da thread de execução: `memory.getWorkingMemory({ threadId: execId })`.
2.  Atualiza a Thread Primária: `memory.updateWorkingMemory({ threadId: primaryId, workingMemory: finalWM })`.

### Passo 6: Manutenção e GraphRAG
1.  Dispara `om.observe({ threadId: primaryId })`.
2.  **Ingestão no Grafo:** Através do hook `onReflectionEnd`, as novas reflexões geradas pelo OM são enviadas para o Neo4j (GraphRAG), tornando-se disponíveis para futuros ciclos através do `HybridRecallProcessor`.

---

## 4. Definição do Componente GraphRAG

O GraphRAG não será apenas uma busca vetorial simples, mas uma rede de relações:
- **Nós:** Entidades (Usuário, Projeto, Tecnologia), Fatos e Observações.
- **Arestas:** Relacionamentos semânticos e temporais.
- **Alimentação:** Exclusivamente via reflexões consolidadas do OM da Thread Primária.

---

## 5. Plano de Ação Imediato (Fase 2 Detalhada)
- [x] Refatorar Factory para derivar IDs do `agent.id`.
- [x] Migrar para `createThread` na inicialização.
- [ ] Implementar o hook de sincronização de WM no orquestrador.
- [ ] Criar o `HybridRecallProcessor` base (apenas log por enquanto).

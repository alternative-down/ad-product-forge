# Design de Contexto: Memória de Dois Níveis (V3 - Detalhado)

Este documento descreve a especificação técnica da gestão de contexto no motor **Mastra Engine**, focada em isolamento de execução, persistência estruturada e integração com GraphRAG.

## 1. Arquitetura de Contexto (O Modelo Mental)

O sistema opera com uma separação clara entre a **Identidade** (História Consolidada) e a **Execução** (Trabalho Transiente).

### Nível 1: Thread Primária (Log de Eventos Limpo)
- **ID:** `primary_${agent.id}`
- **Papel:** Representa a memória de longo prazo e a continuidade da personalidade do agente.
- **Estrutura:** Mantém apenas o par inicial `User Request` e a resposta final `Agent Result`.
- **Mecânica de Memória:** O **Observational Memory (OM)** atua aqui. Ele observa as mensagens salvas e as substitui por resumos densos (Observações e Reflexões) assim que os limites de tokens são atingidos.

### Nível 2: Thread de Execução (Transient Runtime)
- **ID:** `exec_${agent.id}_${Date.now()}`
- **Papel:** Workspace volátil onde o agente "pensa", chama ferramentas e comete erros.
- **Herança:** Criada via `cloneThread()` a partir da Thread Primária no início de cada ciclo. Isso garante que o agente comece a tarefa sabendo tudo o que foi consolidado anteriormente (via herança de OM e WM).
- **Mecânica de Memória:** 
    - **Working Memory (WM):** Estado mutável para guiar a tarefa atual. É copiado durante a clonagem.
    - **Hybrid Recall Processor:** Injeta contexto dinâmico a cada passo do loop (`processInputStep`).

---

## 2. Implementação Técnica

### 2.1 Orquestrador (`executeAutonomousCycle`)
A função gerencia a transição e sincronização entre os níveis:

1.  **Clone:** `memory.cloneThread({ source: primaryId, newId: execId })`. Herda observações e o estado atual do WM.
2.  **Generate:** `agent.generate()` na `execId`. O agente trabalha livremente com ferramentas.
3.  **Consolidação:** Após o sucesso, salvamos manualmente o par Request/Response na `primaryId` via `memory.saveMessages()`.
4.  **Sync WM:** Extraímos o WM final da `execId` (`memory.getWorkingMemory`) e atualizamos a `primaryId` (`memory.updateWorkingMemory`). Isso garante que aprendizados estruturados ("O usuário prefere X") persistam.
5.  **Manutenção OM:** Disparamos `om.observe({ threadId: primaryId })`. O OM processará as novas mensagens e comprimirá o histórico se necessário.

### 2.2 Hybrid Recall Processor
Ativo apenas no Nível 2, este processador consulta:
- `memory.recall()`: Busca semântica em mensagens passadas.
- **Neo4j (GraphRAG):** Recupera fatos e relações do grafo de conhecimento.
- **Workspace Search:** Busca híbrida nos arquivos locais.

### 2.3 Integração GraphRAG (Neo4j)
O grafo é alimentado pelas **Reflexões** geradas pelo OM na Thread Primária.
- **Hook:** Usaremos o hook `onReflectionEnd` no `ObservationalMemory`.
- **Fluxo:** Reflection Gerada -> Agente Extrator -> Ingestão Neo4j (Entidades/Relações).

---

## 3. Configuração de Identificadores

Tudo é centralizado no `agent.id`:
- **DB:** `agent_${agent.id}.db`
- **Threads:** `primary_${agent.id}` e `exec_${agent.id}_...`
- **Workspace:** `workspace_${agent.id}/`

## 4. Estado da Implementação

- [x] **Fase 1:** Fundação do orquestrador básica.
- [x] **Fase 2:** Ciclo transiente com clonagem (`cloneThread`) e persistência de threads de execução.
- [x] **Fase 3:** Sincronização manual de Working Memory entre threads.
- [x] **Fase 4:** Manutenção programática do OM (`om.observe`) integrada ao orquestrador.
- [ ] **Fase 5:** Implementação do `HybridRecallProcessor` (Mensagens + Workspace + GraphRAG).
- [ ] **Fase 6:** Conexão Neo4j e hook de ingestão automática via OM.

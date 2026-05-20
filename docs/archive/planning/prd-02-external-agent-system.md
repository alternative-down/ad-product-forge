# PRD-02: Sistema de Agentes Externos

**Status:** Planejamento
**Data:** 2026-03-15

> **Nota:** Este é um projeto pessoal de um desenvolvedor solo. Os requisitos focam em funcionalidade e simplicidade.

---

## Objetivo

Permitir que agentes internos criem dinamicamente agentes especialistas temporários para tarefas de consulta, pesquisa ou delegação. Agentes externos são agentes regulares criados via workflow, comunicam via provedor de mensagens padrão, e podem ser terminados quando as tarefas se completam.

---

## Requisitos

### FR1: Criar Agente Externo

- Agente interno solicita criação de agente externo via ferramenta
- Entrada: nome, role, systemPrompt, contexto (opcional)
- Agente externo criado usando `createSimpleAgent()` com workflow
- Retornado: externalAgentId, conversationId
- Agente externo salvo na tabela `agents` (sem tabela separada)

### FR2: Comunicação

- Agente externo comunica via ferramentas `sendMessage()` / `getMessages()`
- Usa provedor `external_agent_chat` (similar ao chat interno)
- Mensagens roteadas entre agente interno e externo apenas

### FR3: Terminação

- Agente interno pode terminar agente externo
- Agente externo marcado como terminado no banco de dados
- Mensagens não são mais aceitas

---

## Arquitetura

### Componentes

1. **Integração com Workflow** — Usar workflow Mastra para criar agente externo
2. **Provedor de Chat de Agente Externo** — Novo provedor `external_agent_chat` (cópia do chat interno)
3. **Armazenamento de Agentes** — Agentes externos armazenados na tabela `agents` (mesmo que agentes regulares)
4. **Mensagens** — Usar ferramentas de módulo de comunicação existentes

### Fluxo

```
Agente Interno invoca workflow de agente externo
  │
  ├─ Mastra workflow: createExternalAgent({name, role, systemPrompt, context})
  │
  ├─ Workflow cria agente:
  │  ├─ agentId = UUID (marca como externo)
  │  ├─ instructions = systemPrompt + context
  │  ├─ model = mesmo do pai
  │  └─ Salvar na tabela agents
  │
  └─ Retornar agentId + conversationId

Comunicação (usa mensagens padrão)
  │
  ├─ sendMessage(externalAgentId, content)
  │  └─ Mensagem via provedor external_agent_chat
  │
  ├─ Agente recebe, gera resposta
  │  └─ Resposta via sendMessage()
  │
  └─ getMessages(externalAgentId)

Terminação
  │
  └─ Mastra workflow: terminateExternalAgent(externalAgentId)
     └─ Marcar status do agente = "terminated"
```

---

## Schema do Banco de Dados

**Nenhuma tabela nova necessária.** Agentes externos armazenados na tabela existente `agents`.

**Adições à tabela agents:**

- `is_external` (booleano, padrão false)
- `parent_agent_id` (TEXT, opcional - rastreia criador)
- `terminated_at` (TIMESTAMP, opcional)

---

## Provedor: Chat de Agente Externo

Nova configuração de provedor:

- Nome: `external_agent_chat`
- Tipo: Mensagens internas (sem credenciais externas)
- Habilita mensagens entre agentes internos e externos apenas
- Baseado em provedor de chat interno existente

---

## Decisões Técnicas

### 1. Usar Criação Existente de Agentes

**Decisão:** Agentes externos = agentes regulares criados via workflow

**Justificativa:**

- Mais simples que infraestrutura separada
- Reutiliza capacidades de agentes existentes
- System prompt fornece definição de escopo/expertise

### 2. Ferramentas de Mensagens Existentes

**Decisão:** Usar `sendMessage()` / `getMessages()` padrão para comunicação

**Justificativa:**

- Nenhuma ferramenta duplicada necessária
- Roteamento de provedor lida com isolamento de agentes
- Mesma API para todos os agentes

### 3. Mesma Tabela de Agentes

**Decisão:** Agentes externos armazenados na tabela `agents` com flags

**Justificativa:**

- Sem duplicação de schema
- Gerenciamento unificado de ciclo de vida de agentes
- Queries mais simples e operações admin

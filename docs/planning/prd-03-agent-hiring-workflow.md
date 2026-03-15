# PRD-03: Workflow de Contratação de Agentes

**Status:** Planejamento
**Data:** 2026-03-15

> **Nota:** Este é um projeto pessoal de um desenvolvedor solo. Os requisitos focam em funcionalidade e simplicidade.

---

## Objetivo

Permitir que agentes internos criem e provisionem autonomamente agentes especialistas permanentes com roles específicas, provedores de comunicação e ferramentas. A contratação de agentes segue o padrão de workflow Mastra similar a agentes externos mas com configuração persistente.

---

## Requisitos

### FR1: Criar Agente com Role
- Agente interno solicita contratar agente via ferramenta
- Entrada: nome, role, função, systemPrompt, provedores (lista), contexto (opcional)
- Criado usando workflow Mastra (similar a `createSimpleAgent()`)
- Saída: agentId, conversationId
- Agente salvo na tabela `agents` com metadados de role/função

### FR2: Configuração de Provedor
- Sistema configura múltiplos provedores por agente (Discord, Email, Slack, etc)
- Cada provedor recebe credenciais armazenadas criptografadas (via mecanismo PRD-01)
- Agente inicializado com todas as credenciais de provedor na inicialização
- Pode se comunicar via todos os provedores configurados

### FR3: Ferramentas Baseadas em Role
- Agente atribuído ferramentas baseado em role/função
- Exemplo: role "pesquisa" recebe ferramentas de pesquisa, role "desenvolvedor" recebe ferramentas de desenvolvimento
- Ferramentas carregadas do sistema de tooling baseado em role
- System prompt + role determinam capacidades

### FR4: Rastreamento de Status do Agente
- Rastrear ciclo de vida do agente: provisionando, ativo, terminado
- Agente marcado como ativo após provisionamento bem-sucedido
- Agente contratante recebe confirmação com agentId

---

## Arquitetura

### Componentes

1. **Integração com Workflow** — Workflow Mastra para criar agente
2. **Sistema de Role/Função** — Mapeia role para capacidades, ferramentas, restrições
3. **Provisionamento de Provedor** — Configurar múltiplos provedores por agente (reutilizar PRD-01)
4. **Injeção de Ferramentas** — Carregar ferramentas baseado em role do agente
5. **Armazenamento de Agente** — Tabela agents com metadados de role/função

### Fluxo

```
Agente Interno invoca workflow de contratação
  │
  ├─ Mastra workflow: hireAgent({name, role, function, systemPrompt, providers, context})
  │
  ├─ Workflow executa:
  │  ├─ Validar role existe
  │  ├─ Criar agente:
  │  │  ├─ agentId = UUID
  │  │  ├─ instructions = systemPrompt + context
  │  │  ├─ model = padrão ou específico de role
  │  │  └─ Salvar em agents table com role/function
  │  │
  │  ├─ Configurar provedores:
  │  │  └─ Para cada provedor: criptografar credenciais, armazenar em agent_providers
  │  │
  │  └─ Carregar ferramentas para role
  │
  └─ Retornar agentId + conversationId para agente contratante
```

---

## Schema do Banco de Dados

**Extensões à tabela agents:**
- `role` (TEXT) — identificador de role/função
- `function` (TEXT) — função organizacional
- `is_active` (BOOLEAN) — se agente está ativo

**Nenhuma tabela nova necessária.** Reutilizar `agent_providers` de PRD-01 para credenciais.

---

## Decisões Técnicas

### 1. Usar Workflow Mastra (como Agentes Externos)
**Decisão:** Workflow de contratação cria agentes via workflow Mastra

**Justificativa:**
- Consistente com criação de agentes externos
- Reutiliza padrões existentes de criação de agentes
- Mais simples que infraestrutura separada de contratação

### 2. Injeção de Ferramentas Baseada em Role
**Decisão:** Ferramentas carregadas a partir de configuração de role na criação do agente

**Justificativa:**
- Ferramentas determinadas por role/função
- Mapeamento role → ferramentas simples
- Sem carregamento dinâmico de ferramentas necessário

### 3. Reutilizar Sistema de Provedor (PRD-01)
**Decisão:** Credenciais de provedor armazenados/criptografados da mesma forma que PRD-01

**Justificativa:**
- Criptografia consistente
- Sem duplicação
- Gerenciamento centralizado de credenciais

### 4. Agentes Persistentes
**Decisão:** Agentes contratados persistentes (ao contrário de agentes externos)

**Justificativa:**
- Agentes contratados esperados para rodar indefinidamente
- Sem auto-terminação
- Terminação é ação explícita de admin

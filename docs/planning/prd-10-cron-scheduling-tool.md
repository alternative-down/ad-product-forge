# PRD-10: Ferramenta Cron/Agendamento

> **Nota:** Este é um projeto pessoal para desenvolvedor solo usando agentes LLM. Simplificado para facilidade e praticidade (KISS + YAGNI). Agendamento empresarial, sistemas distribuídos e orquestração complexa estão fora do escopo.

## Visão Geral

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve sistema de agendamento específico para ad-product-forge.** Permite que agentes de Nicolas criem e gerenciem tarefas agendadas usando node-schedule. Esta é funcionalidade específica da aplicação, não infraestrutura do framework Mastra.

A Ferramenta Cron/Agendamento permite que agentes criem e gerenciem tarefas agendadas usando sintaxe cron padrão. Quando um evento agendado dispara, uma mensagem interna desperta o agente para executar a tarefa.

**Comportamento chave (Framework):** Eventos agendados disparam execução de agente via mensagens internas - padrão padrão para qualquer deployment Mastra.

**Comportamento chave (ad-product-forge):** Permitir que agentes de Nicolas agendem autonomamente tarefas de pesquisa, processamento de dados, deployment e relatórios em agendas recorrentes.

---

## Implementação: Usar node-schedule

**Usar biblioteca Node.js:**
- `node-schedule` (npm: `node-schedule`)

Motivo: Suporta tanto cron expressions quanto Date objects, oferecendo mais flexibilidade para agentes definirem agendamentos.

A library fornece o scheduler que avalia regras e dispara callbacks.

---

## Conceitos Principais

### 1. Regra de Agendamento

Uma regra de agendamento define quando uma tarefa deve executar.

**Entidade de regra:**
- `ruleId` — UUID interno, único por agente
- `agentId` — qual agente possui esta regra
- `name` — nome legível da regra (ex: "Daily standup", "Weekly report")
- `description` — descrição opcional detalhada
- `cronExpression` — sintaxe cron padrão (ex: `0 9 * * 1-5` para 9 AM dias úteis)
- `timezone` — string de timezone IANA (ex: `America/New_York`)
- `actionType` — tipo de ação: `message`, `webhook`, `custom`
- `payload` — payload JSON com dados específicos da ação
- `isActive` — booleano, controla se regra é avaliada
- `createdAt`, `updatedAt` — timestamps
- `lastExecutedAt` — quando regra disparou pela última vez
- `nextExecutionAt` — computado: próximo tempo de execução agendado

### 2. Evento de Execução

Quando um tempo agendado corresponde, um evento de execução dispara.

**Fluxo de evento:**
1. Scheduler avalia todas as regras ativas em intervalos regulares (a cada minuto)
2. Para cada regra que corresponde ao tempo atual: criar um evento de execução
3. Gerar auto-mensagem com instruções de tarefa
4. Rotear mensagem através do provedor de chat interno
5. Fila de wake processa mensagem e desperta agente
6. Agente recebe mensagem e executa tarefa

**Dados de evento:**
- `eventId` — UUID, único por execução
- `ruleId` — qual regra disparou
- `executionTime` — quando evento disparou
- `generatedMessageId` — ID de mensagem interna criada
- `status` — `pending`, `executed`, `failed`
- `output` — dados de resultado opcional
- `errorMessage` — se falhado

### 3. Integração com Chat Interno

O provedor de chat interno automaticamente recebe auto-mensagens geradas pelo scheduler.

**Fluxo de auto-mensagem:**
```
Scheduler dispara regra
  ↓
Gerar mensagem de instrução de tarefa
  ↓
Rotear para provedor de chat interno
  ├─ Criar CommunicationInboundMessage
  ├─ Fonte: "scheduler" (sistema interno)
  ├─ Conteúdo: instrução de tarefa auto-gerada
  └─ Disparar callback onMessage
       ↓
    Módulo de comunicação recebe mensagem
       ├─ Armazenar como não lida
       ├─ Criar/atualizar conversa
       └─ Disparar fila de wake
            ↓
         Agente desperta e processa
```

### 4. Geração de Instrução de Tarefa

Quando uma regra dispara, o sistema gera uma instrução de tarefa que se torna o conteúdo da mensagem.

**Template de instrução:**
```
Tarefa Agendada: [Nome da Regra]

Descrição: [Descrição da regra ou mensagem padrão]

Tipo: [actionType]
Agendado: [cronExpression] ([timezone])
Tempo de Execução: [ISO timestamp]

Detalhes da Ação:
[detalhes específicos da ação de payload]

---
Esta é uma tarefa agendada automatizada. Revise as instruções acima e execute conforme necessário.
```

---

## Schema do Banco de Dados

**Tabela: agent_schedules**
```typescript
agent_schedules {
  id: UUID (primary key)
  agent_id: UUID (foreign key -> agents)
  name: string (nome legível da regra)
  description: string (opcional)
  schedule_type: 'cron' | 'date' // cron expression ou Date specific
  cron_expression: string (opcional, ex: "0 9 * * 1-5")
  scheduled_date: timestamp (opcional, para execuções em data específica)
  timezone: string (IANA timezone, ex: "America/New_York")
  action_type: string (ex: "message", "webhook")
  payload: JSON (dados específicos da ação)
  is_active: boolean (default true)
  created_at: timestamp
  updated_at: timestamp
  last_executed_at: timestamp (opcional)
  next_execution_at: timestamp (computed)
}
```

---

## CRUD de Agendamentos

**Ferramentas para Agentes:**

**FR1: Criar Agendamento**
- `createSchedule(agentId, {name, description, scheduleType, cronExpression|scheduledDate, timezone, actionType, payload})`
- Retorna: scheduleId

**FR2: Listar Agendamentos do Agente**
- `listSchedules(agentId)`
- Retorna: array de agendamentos

**FR3: Atualizar Agendamento**
- `updateSchedule(scheduleId, {name?, description?, isActive?, payload?})`
- Permite alteração de nome, descrição, ativação/desativação, payload

**FR4: Deletar Agendamento**
- `deleteSchedule(scheduleId)`
- Remove agendamento do banco e cancela execução

**FR5: Recarregar na Inicialização**
- Na inicialização da aplicação:
  - Carregar todos os agendamentos ativos do banco de dados
  - Para cada agendamento: registrar com node-schedule
  - Se houver próxima execução passada, executar imediatamente (catch-up)

**Exemplo para standup recorrente:**
```
Tarefa Agendada: Daily Standup

Descrição: Compartilhar update de progresso com o time

Tipo: message
Agendado: 0 9 * * 1-5 (America/New_York)
Tempo de Execução: 2026-03-16T09:00:00-04:00

Detalhes da Ação:
Canal: #engineering-team
Template: Daily standup - O que foi feito, o que vem a seguir, blockers?

---
Esta é uma tarefa agendada automatizada. Revise as instruções acima e execute conforme necessário.
```

---

## Schema do Banco de Dados

**Tabela: agent_schedules**
```typescript
agent_schedules {
  id: UUID (primary key)
  agent_id: UUID (foreign key -> agents)
  name: string (nome legível da regra)
  description: string (opcional)
  schedule_type: 'cron' | 'date' // cron expression ou Date specific
  cron_expression: string (opcional, ex: "0 9 * * 1-5")
  scheduled_date: timestamp (opcional, para execuções em data específica)
  timezone: string (IANA timezone, ex: "America/New_York")
  action_type: string (ex: "message", "webhook")
  payload: JSON (dados específicos da ação)
  is_active: boolean (default true)
  created_at: timestamp
  updated_at: timestamp
  last_executed_at: timestamp (opcional)
  next_execution_at: timestamp (computed)
}
```

---

## CRUD de Agendamentos

**Ferramentas para Agentes:**

**FR1: Criar Agendamento**
- `createSchedule(agentId, {name, description, scheduleType, cronExpression|scheduledDate, timezone, actionType, payload})`
- Retorna: scheduleId

**FR2: Listar Agendamentos do Agente**
- `listSchedules(agentId)`
- Retorna: array de agendamentos

**FR3: Atualizar Agendamento**
- `updateSchedule(scheduleId, {name?, description?, isActive?, payload?})`
- Permite alteração de nome, descrição, ativação/desativação, payload

**FR4: Deletar Agendamento**
- `deleteSchedule(scheduleId)`
- Remove agendamento do banco e cancela execução

**FR5: Recarregar na Inicialização**
- Na inicialização da aplicação:
  - Carregar todos os agendamentos ativos do banco de dados
  - Para cada agendamento: registrar com node-schedule
  - Se houver próxima execução passada, executar imediatamente (catch-up)

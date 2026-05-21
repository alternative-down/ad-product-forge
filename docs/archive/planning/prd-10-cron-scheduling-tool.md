# PRD-10: Ferramenta Cron/Agendamento

> **Nota:** Este é um projeto pessoal para desenvolvedor solo usando agentes LLM. Simplificado para facilidade e praticidade (KISS + YAGNI). Agendamento empresarial, sistemas distribuídos e orquestração complexa estão fora do escopo.

## Visão Geral

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve o sistema de agendamento específico para ad-product-forge.** Permite que agentes criem e gerenciem wakes agendados usando `node-schedule`. Esta é funcionalidade específica da aplicação, não infraestrutura do framework Mastra.

A Ferramenta Cron/Agendamento permite que agentes criem wakes agendados com sintaxe cron padrão ou data específica. Quando um evento agendado dispara, uma notificação interna desperta o agente para executar a tarefa.

**Comportamento chave (Framework):** Eventos agendados disparam execução de agente via notificações internas e `wakeQueue`.

**Comportamento chave (ad-product-forge):** Permitir que agentes agendem autonomamente tarefas futuras, recorrentes ou pontuais, usando um `content` textual que será entregue de volta ao próprio agente.

---

## Heartbeat (Separado)

Heartbeat continua sendo um conceito separado no comportamento, mas usa a mesma tabela `agent_schedules`.

Neste PRD:

- schedules criados pelo agente usam `kind = 'agent'`;
- heartbeat do sistema usa `kind = 'heartbeat'`;
- heartbeat não aparece nas tools do agente;
- heartbeat só chama `wakeQueue`, sem criar `agent_notifications`.
- heartbeat é criado explicitamente no hiring do agente, não no boot da aplicação.

### Controle de acesso

- agentes conseguem apenas gerenciar seus próprios agendamentos;
- heartbeat continua sendo sistema-level, fora do controle do agente.

---

## Implementação: Usar node-schedule

**Usar biblioteca Node.js:**

- `node-schedule` (npm: `node-schedule`)

Motivo: suporta tanto cron expressions quanto `Date`, oferecendo mais flexibilidade para agentes definirem agendamentos.

A library fornece o scheduler que avalia regras e dispara callbacks.

---

## Conceitos Principais

### 1. Regra de agendamento

Uma regra de agendamento define quando um wake futuro deve ocorrer e qual conteúdo textual será entregue ao agente.

**Entidade de regra:**

- `scheduleId` — UUID interno
- `agentId` — qual agente possui esta regra
- `name` — nome legível da regra (ex: `Daily standup`, `Weekly report`)
- `description` — descrição opcional
- `scheduleType` — `cron` ou `date`
- `cronExpression` — sintaxe cron padrão (ex: `0 9 * * 1-5`)
- `scheduledDate` — data/hora específica para execução única
- `timezone` — timezone IANA
- `content` — texto que será entregue ao agente quando o schedule disparar
- `isActive` — controla se a regra está ativa
- `createdAt`, `updatedAt` — timestamps
- `lastTriggeredAt` — quando a regra disparou pela última vez
- `nextTriggerAt` — próxima execução planejada

### 2. Evento de Execução

Quando um tempo agendado corresponde, um evento de execução dispara.

**Fluxo de evento:**

1. Scheduler carrega e registra as regras ativas
2. Quando a regra dispara, cria um evento de execução
3. Gera uma notificação textual em `agent_notifications`
4. Chama `wakeQueue`
5. O agente acorda e processa o `content` do schedule

**Dados de evento:**

- `eventId` — UUID, único por execução
- `scheduleId` — qual regra disparou
- `executionTime` — quando evento disparou
- `generatedNotificationId` — ID da notificação interna criada
- `status` — `pending`, `executed`, `failed`
- `output` — dados de resultado opcional
- `errorMessage` — se falhado

### 3. Integração com notificações do agente

O scheduler gera notificações internas em `agent_notifications`.

**Fluxo de notificação:**

```
Scheduler dispara regra
  ↓
Gerar texto de instrução da tarefa
  ↓
Criar agent_notification
  ├─ Fonte: "scheduler"
  ├─ Conteúdo: texto configurado pelo agente no schedule
  └─ Marcar como não lida
       ↓
Disparar wakeQueue
       ↓
Agente desperta e processa
```

### 4. Conteúdo do schedule

Quando uma regra dispara, o sistema gera o conteúdo textual da notificação a partir dos dados da própria regra.

**Template de instrução:**

```
Tarefa agendada: [Nome da Regra]

Descrição: [Descrição da regra ou mensagem padrão]

Agendado: [cronExpression] ([timezone])
Tempo de Execução: [ISO timestamp]

Conteúdo:
[content]

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
  kind: 'agent' | 'heartbeat'
  name: string
  description: string (opcional)
  schedule_type: 'cron' | 'date'
  cron_expression: string (opcional)
  scheduled_date: timestamp (opcional)
  timezone: string
  content: string
  is_active: boolean (default true)
  created_at: timestamp
  updated_at: timestamp
  last_triggered_at: timestamp (opcional)
  next_trigger_at: timestamp (opcional)
}
```

---

## CRUD de Agendamentos

**Tools para agentes:**

Seguir a mesma regra de superfície:

- `list_*` retorna subitens quando fizer sentido
- `get_*` retorna um item completo
- `manage_*` agrupa `create | update | delete`
- `toggle_*` cobre estados recíprocos

**FR1: Listar agendamentos**

- `list_agent_schedules()`
- Retorna array de agendamentos do próprio agente

**FR2: Obter um agendamento**

- `get_agent_schedule({scheduleId})`
- Retorna um agendamento completo

**FR3: Gerenciar agendamento**

- `manage_agent_schedule({action, scheduleId?, name?, description?, scheduleType?, cronExpression?, scheduledDate?, timezone?, content?})`
- `action: create | update | delete`
- criação e atualização continuam permitindo alteração parcial quando aplicável

**FR4: Ativar/desativar agendamento**

- `toggle_agent_schedule({scheduleId, isActive})`
- altera apenas o estado ativo/inativo

**FR5: Recarregar na inicialização**

- Na inicialização da aplicação:
  - Carregar todos os agendamentos ativos do banco de dados
  - Para cada agendamento: registrar com node-schedule
  - Atualizar `nextTriggerAt` com a próxima execução calculada

**Exemplo para standup recorrente:**

```
Tarefa agendada: Daily Standup

Descrição: Compartilhar update de progresso com o time

Agendado: 0 9 * * 1-5 (America/New_York)
Tempo de Execução: 2026-03-16T09:00:00-04:00

Conteúdo:
Compartilhar update de progresso: o que foi feito, o que vem a seguir e blockers.

---
Esta é uma tarefa agendada automatizada. Revise as instruções acima e execute conforme necessário.
```

# PRD 24: Ticketing System

**Status:** Draft - Detailed Analysis and Planning
**Data:** 2026-03-15
**Versão:** 1.0
**Responsável:** Communication & Support Infrastructure Team

---

## Resumo Executivo

### Objetivo Principal
Implementar um sistema de tickets de suporte integrado que funcione como provider de comunicação (ao lado de Discord, Email, etc.), permitindo que agentes gerenciem, criem, atualizem e resolvam tickets para as aplicações que constroem, com suporte a roteamento inteligente, SLA tracking e integração com workflows de grupo.

### Proposta de Valor
1. **Suporte Escalável:** Infraestrutura centralizada de tickets para múltiplas aplicações gerenciadas por agentes
2. **Comunicação Unificada:** Tickets como provider primeiro, integrado com Discord/Email/Slack/SMS
3. **Automação para Agentes:** Agentes podem criar, gerenciar e resolver tickets automaticamente
4. **Roteamento Inteligente:** Encaminhar tickets por categoria, prioridade, especialidade ou carga de trabalho
5. **Auditoria Completa:** Histórico de todas as ações em tickets para compliance e análise

### Escopo da Feature
- Criar infraestrutura de banco de dados para tickets, categorias e attachments
- Implementar Ticketing como provider de comunicação (CommunicationProvider interface)
- Habilitar agentes a criar/atualizar/resolver tickets via tools
- Suportar integração entre tickets e comunicação multi-provider (notify via email/Discord quando ticket criado)
- Implementar roteamento de tickets (queue, assignment, reassignment)
- Fornecer SLA tracking e alertas de escalação
- Habilitar grupo de agentes gerenciar tickets conjuntamente (via group chat)

### Não está no Escopo
- UI/Dashboard de gerenciamento de tickets (Phase 2)
- Suporte a webhooks de tickets (Phase 2)
- Mobile app para tickets (Phase 3)
- Integração com terceiros (Jira, Zendesk, ServiceNow) - Phase 3
- ML-based ticket classification/routing (Phase 2)

---

## 2. Contexto Técnico Atual

### Arquitetura Existente

#### Communication Provider Architecture (v2)
```
Runtime (createAgent/createForgeAgent)
  ├─ Communication Module
  │  ├─ Provider Registry
  │  │  ├─ CommunicationProvider interface
  │  │  ├─ EmailProvider (IMAP/SMTP)
  │  │  ├─ DiscordProvider
  │  │  ├─ SlackProvider
  │  │  └─ [NEW] TicketingProvider
  │  │
  │  ├─ Database (Drizzle ORM)
  │  │  ├─ accounts, contacts, conversations, messages
  │  │  ├─ provider_configurations, provider_credentials
  │  │  └─ [NEW] tickets, ticket_attachments, ticket_history, ticket_queues
  │  │
  │  └─ Agent-facing Tools
  │     ├─ sendMessage(provider, to, content)
  │     ├─ getConversations(provider, filter)
  │     ├─ [NEW] createTicket(params)
  │     ├─ [NEW] updateTicket(ticketId, changes)
  │     ├─ [NEW] resolveTicket(ticketId, resolution)
  │     └─ [NEW] listTickets(filter)
  │
  └─ Group Chat Integration
     ├─ Tickets podem ser discutidos em grupo chat
     ├─ Notificações de tickets em grup
     └─ Atribuição coletiva de tickets
```

#### Problema Identificado
1. **Sem infraestrutura de suporte:** Agentes criam aplicações mas não têm forma de gerenciar suporte
2. **Sem comunicação via tickets:** Apenas email/Discord, sem canal dedicado para issues/bugs
3. **Sem roteamento:** Não há lógica para encaminhar tickets para agentes/especialistas corretos
4. **Sem SLA:** Impossível rastrear tempo de resposta ou escalar issues antigas
5. **Sem grupo de agentes:** Um agente não pode trabalhar cooperativamente em tickets
6. **Sem auditoria:** Histórico de tickets não é rastreado completamente

### Stack Técnico Atual
- **Runtime:** Node.js + TypeScript
- **ORM:** Drizzle (novo, pós PRD-02)
- **Database:** LibSQL (SQLite-compatible)
- **Communication Module:** Providers baseados em CommunicationProvider interface

### Dependências Existentes
- Drizzle ORM (adicionado em PRD-02)
- zod (validação)
- Group Chat Module (PRD-09, PRD-10)
- Communication Provider System (PRD-02)

---

## 3. Requisitos Funcionais

### 3.1 Estrutura de Dados de Tickets

**RF-1: Tabelas de tickets**
- Armazenar tickets com campos padrão:
  - Identificação: `id`, `ticket_number` (humanizável, ex: TKT-001)
  - Criação: `created_by` (agentId ou userId), `created_at`, `organization_id` (aplicação do agente)
  - Conteúdo: `title`, `description`, `category`, `priority` (low/medium/high/urgent)
  - Status: `status` (open/in-progress/waiting/resolved/closed)
  - Atribuição: `assigned_to` (agentId), `assigned_at`
  - Comunicação: `last_message_at`, `message_count`
  - Resolução: `resolved_at`, `resolved_by`, `resolution_notes`
  - SLA: `sla_deadline`, `sla_breached` (boolean)
  - Timestamps: `updated_at`

**RF-2: Categorias de tickets**
- Permitir custom categories por aplicação:
  - Bug Report, Feature Request, General Support, Billing, Technical, Account
  - Cada categoria pode ter SLA padrão associado
  - Categorias podem ser mapeadas para queues específicas (roteamento)

**RF-3: Attachments de tickets**
- Suportar arquivos anexados a tickets:
  - Nome, tamanho, tipo MIME, URL/path de storage
  - Auditoria: quem adicionou, quando
  - Limite de tamanho por attachment (ex: 10MB)

**RF-4: Histórico e Auditoria**
- Registrar todas as mudanças:
  - Campo alterado, valor anterior, valor novo, quem alterou, quando
  - Inclui: status changes, assignments, notes added, attachments added
  - Imutável (append-only log)

### 3.2 Ticketing como CommunicationProvider

**RF-5: Implementar TicketingProvider**
- Extends `CommunicationProvider` interface
- Métodos obrigatórios:
  - `sendMessage(to: string, content: string)` → Cria/atualiza ticket com mensagem
  - `getConversations(filter)` → Lista tickets como conversas
  - `getMessages(conversationId)` → Lista updates/comments de ticket
  - `initialize()` → Setup de banco de dados

**RF-6: Tickets como conversas**
- Um ticket = uma conversa (thread)
- Comentários/updates = mensagens dentro da conversa
- Suporta múltiplos participantes (criador + assignee + grupo)
- Histórico de conversa persistido junto com ticket

**RF-7: Notificações multi-provider**
- Quando ticket é criado/atualizado:
  - Notificar via email (se agent tem email provider)
  - Notificar via Discord (se agent tem Discord provider)
  - Notificar via SMS/Telegram (se implementado)
  - Notificar via group chat (se ticket em grupo)

### 3.3 Agentes Gerenciando Tickets

**RF-8: Tools para agentes**
```typescript
// Criar ticket
createTicket({
  organizationId: string,      // Qual aplicação/org
  title: string,
  description: string,
  category: string,
  priority: 'low' | 'medium' | 'high' | 'urgent',
  assignedTo?: string,         // Qual agente (ou grupo)
  tags?: string[],
})

// Listar tickets
listTickets({
  organizationId: string,
  filter?: {
    status?: string[],         // open, in-progress, resolved, closed
    assignedTo?: string,       // Meus tickets
    category?: string,
    priority?: string,
    createdAfter?: Date,
    search?: string,           // Full-text search em title/description
  },
  sort?: 'recent' | 'priority' | 'sla-deadline' | 'oldest-unresolved',
  limit?: number,
  offset?: number,
})

// Atualizar ticket
updateTicket({
  ticketId: string,
  changes: {
    title?: string,
    description?: string,
    status?: string,
    priority?: string,
    assignedTo?: string,
    notes?: string,            // Comentário/nota adicional
  },
})

// Resolver ticket
resolveTicket({
  ticketId: string,
  resolutionNotes: string,
  satisfactionRating?: 1 | 2 | 3 | 4 | 5,
})

// Adicionar comentário/update
addTicketComment({
  ticketId: string,
  content: string,
  attachment?: File,
})
```

**RF-9: Contexto de execução**
- Ao executar tools, agent sabe seu próprio `agentId`
- Tickets criados por agent são marcados com `created_by: agentId`
- Agente só vê/gerencia tickets da sua organização (isolamento multi-tenant)

### 3.4 Roteamento de Tickets

**RF-10: Sistema de queues**
- Criar queues por categoria/especialidade:
  - Mapping: categoria → queue(s)
  - Exemplo: "Bug Report" → queue "engineering", "Billing" → queue "finance"
  - Um ticket pode estar em múltiplas queues (para supervisão)

**RF-11: Atribuição de tickets**
- Manual: Agent especifica `assignedTo` ao criar ticket
- Automático: Roteador distribui baseado em:
  - Carga de trabalho atual (menos tickets = próximo)
  - Especialidade (tags de capability do agente)
  - Prioridade (urgent tickets primeiro)
  - Round-robin (se todos iguais)

**RF-12: Reassignment**
- Agente pode reassignar ticket para outro
- Notificar novo assignee
- Auditar mudança de atribuição

### 3.5 SLA Tracking

**RF-13: SLA configuration**
- Configurar SLA por categoria:
  - Prazo em horas (ex: Bug Urgent = 2h, Feature Request = 48h)
  - Condição: desde criação até resolução
- Status: on-track, at-risk (90% do deadline), breached

**RF-14: SLA monitoring**
- Rastrear `sla_deadline` e `sla_breached`
- Alertas quando atingir 90% do deadline
- Reports de compliance de SLA

### 3.6 Integração com Group Chat

**RF-15: Tickets em grupo**
- Group chat pode gerenciar tickets coletivamente
- Criar ticket de conversa de grupo: `/ticket create "Bug in login flow"`
- Atualizar ticket em grupo: `/ticket update TKT-123 "Fixed in v1.2.1"`
- Listar tickets de grupo: `/ticket list`

**RF-16: Notificações de grupo**
- Novo ticket assinalado ao grupo → notifica grupo
- Ticket atualizado → notifica grupo
- SLA breach iminente → escalação em grupo

---

## 4. Requisitos Não-Funcionais

### 4.1 Performance
- **RNF-1:** Listar tickets (100 records) < 200ms
- **RNF-2:** Criar ticket < 100ms
- **RNF-3:** Full-text search em 1000+ tickets < 500ms
- **RNF-4:** Índices em status, priority, created_at, assigned_to

### 4.2 Segurança
- **RNF-5:** Isolamento multi-tenant: agente vê apenas tickets de sua org
- **RNF-6:** Auditoria imutável: histórico não pode ser alterado
- **RNF-7:** Validação de autorização: só assignee/creator/supervisor pode atualizar
- **RNF-8:** Criptografia: dados sensíveis em descrição (PII) criptografados opcionalmente

### 4.3 Escalabilidade
- **RNF-9:** Suportar 10k+ tickets por org sem degradação
- **RNF-10:** Arquivar tickets antigos (> 1 ano) para storage otimizado
- **RNF-11:** Paginação obrigatória em listagem (max 1000 records por página)

### 4.4 Auditoria & Compliance
- **RNF-12:** Imutabilidade: ticket_history append-only
- **RNF-13:** Rastreabilidade: cada ação registra `createdBy`, `timestamp`, `ipAddress` (futuro)
- **RNF-14:** Retenção: tickets podem ter retention policy

### 4.5 Confiabilidade
- **RNF-15:** Criação de ticket é atomic (ticket + first history entry)
- **RNF-16:** Notificações multi-provider não bloqueiam (async)
- **RNF-17:** Falha em um provider notification não cancela ticket

---

## 5. Arquitetura da Solução

### 5.1 Novas Tabelas de Banco de Dados

```sql
-- Tabela principal de tickets
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,                        -- uuid
  ticket_number TEXT NOT NULL,                -- Humanizável: TKT-001, sequencial
  organization_id TEXT NOT NULL,              -- Qual app/cliente

  -- Conteúdo
  title TEXT NOT NULL,
  description TEXT NOT NULL,                  -- Pode conter PII, considerar encriptação
  category TEXT NOT NULL,                     -- bug, feature, support, billing, etc

  -- Status e prioridade
  status TEXT NOT NULL,                       -- open, in-progress, waiting, resolved, closed
  priority TEXT NOT NULL,                     -- low, medium, high, urgent

  -- Atribuição
  created_by TEXT NOT NULL,                   -- agentId ou userId
  assigned_to TEXT,                           -- agentId (null = unassigned)
  assigned_at TIMESTAMP,

  -- Group chat
  group_conversation_id TEXT,                 -- Se ticket criado de grupo (FK)

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_at TIMESTAMP,

  -- SLA
  sla_deadline TIMESTAMP,
  sla_breached BOOLEAN DEFAULT FALSE,

  -- Resolução
  resolved_at TIMESTAMP,
  resolved_by TEXT,
  resolution_notes TEXT,

  -- Satisfação
  satisfaction_rating INTEGER,                -- 1-5 stars

  INDEX idx_organization_id (organization_id),
  INDEX idx_status (status),
  INDEX idx_assigned_to (assigned_to),
  INDEX idx_created_by (created_by),
  INDEX idx_created_at (created_at),
  INDEX idx_sla_deadline (sla_deadline),
  UNIQUE idx_organization_ticket_number (organization_id, ticket_number)
);

-- Histórico e auditoria de mudanças
CREATE TABLE ticket_history (
  id TEXT PRIMARY KEY,                        -- uuid
  ticket_id TEXT NOT NULL,                    -- FK to tickets

  -- Mudança
  action TEXT NOT NULL,                       -- created, status_changed, assigned, noted, resolved, attachment_added
  field_name TEXT,                            -- Qual campo foi alterado
  old_value TEXT,                             -- Valor anterior
  new_value TEXT,                             -- Valor novo

  -- Auditoria
  changed_by TEXT NOT NULL,                   -- agentId/userId
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  description TEXT,                           -- Contexto adicional

  INDEX idx_ticket_id (ticket_id),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

-- Comentários/Mensagens dentro de um ticket
CREATE TABLE ticket_messages (
  id TEXT PRIMARY KEY,                        -- uuid
  ticket_id TEXT NOT NULL,

  content TEXT NOT NULL,
  author_id TEXT NOT NULL,                    -- agentId/userId
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Reações/Marcação
  is_pinned BOOLEAN DEFAULT FALSE,
  is_internal BOOLEAN DEFAULT FALSE,          -- Nota interna (não visível ao cliente)

  INDEX idx_ticket_id (ticket_id),
  INDEX idx_author_id (author_id),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

-- Attachments em tickets
CREATE TABLE ticket_attachments (
  id TEXT PRIMARY KEY,                        -- uuid
  ticket_id TEXT NOT NULL,
  message_id TEXT,                            -- FK (opcional, attachment em comentário)

  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,                 -- Bytes
  mime_type TEXT,

  -- Storage
  storage_url TEXT NOT NULL,                  -- S3 URL ou path
  storage_provider TEXT,                      -- s3, local, etc (futuro)

  -- Metadata
  uploaded_by TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_ticket_id (ticket_id),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

-- Categorias de tickets (lookup)
CREATE TABLE ticket_categories (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,                         -- bug, feature, support, etc
  description TEXT,
  color TEXT,                                 -- Para UI futuro

  -- SLA padrão
  sla_hours_default INTEGER,                  -- Padrão em horas

  -- Roteamento
  queue_ids TEXT,                             -- JSON array de queue IDs

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE idx_org_name (organization_id, name),
  INDEX idx_organization_id (organization_id)
);

-- Queues (para roteamento de tickets)
CREATE TABLE ticket_queues (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,                         -- engineering, finance, support, etc
  description TEXT,

  -- Membros da queue
  agent_ids TEXT NOT NULL,                    -- JSON array de agentIds

  -- Config
  round_robin BOOLEAN DEFAULT FALSE,
  max_per_agent INTEGER,                      -- Limite de tickets por agente

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE idx_org_queue_name (organization_id, name),
  INDEX idx_organization_id (organization_id)
);

-- Assignments (rastreando reassignments)
CREATE TABLE ticket_assignments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  assigned_to TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  reason TEXT,                                 -- manual, auto-routed, escalated, etc
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unassigned_at TIMESTAMP,                    -- Quando foi reassignado

  INDEX idx_ticket_id (ticket_id),
  INDEX idx_assigned_to (assigned_to),
  INDEX idx_assigned_at (assigned_at)
);

-- SLA tracking
CREATE TABLE ticket_sla (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  category_id TEXT,                           -- Qual SLA config foi aplicada

  deadline TIMESTAMP NOT NULL,
  breached BOOLEAN DEFAULT FALSE,
  breached_at TIMESTAMP,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_ticket_id (ticket_id),
  INDEX idx_deadline (deadline),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);
```

### 5.2 Schema Drizzle ORM

```typescript
// packages/mastra-engine/src/db/schema.ts (additions)

import { sqliteTable, text, integer, boolean, timestamp } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

export const tickets = sqliteTable('tickets', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  ticketNumber: text().notNull(),             // TKT-001, TKT-002, etc
  organizationId: text().notNull(),

  title: text().notNull(),
  description: text().notNull(),
  category: text().notNull(),

  status: text().$type<'open' | 'in-progress' | 'waiting' | 'resolved' | 'closed'>().notNull(),
  priority: text().$type<'low' | 'medium' | 'high' | 'urgent'>().notNull(),

  createdBy: text().notNull(),
  assignedTo: text(),
  assignedAt: timestamp(),

  groupConversationId: text(),

  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
  lastMessageAt: timestamp(),

  slaDeadline: timestamp(),
  slaBreached: boolean().default(false),

  resolvedAt: timestamp(),
  resolvedBy: text(),
  resolutionNotes: text(),

  satisfactionRating: integer(),
}, (table) => ({
  idxOrganizationId: index().on(table.organizationId),
  idxStatus: index().on(table.status),
  idxAssignedTo: index().on(table.assignedTo),
  idxCreatedBy: index().on(table.createdBy),
  idxCreatedAt: index().on(table.createdAt),
  idxSlaDeadline: index().on(table.slaDeadline),
  uniqueOrgTicketNumber: uniqueIndex().on(table.organizationId, table.ticketNumber),
}));

export const ticketHistory = sqliteTable('ticket_history', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  ticketId: text().notNull().references(() => tickets.id, { onDelete: 'cascade' }),

  action: text().$type<'created' | 'status_changed' | 'assigned' | 'noted' | 'resolved' | 'attachment_added'>().notNull(),
  fieldName: text(),
  oldValue: text(),
  newValue: text(),

  changedBy: text().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
  description: text(),
}, (table) => ({
  idxTicketId: index().on(table.ticketId),
  idxCreatedAt: index().on(table.createdAt),
}));

export const ticketMessages = sqliteTable('ticket_messages', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  ticketId: text().notNull().references(() => tickets.id, { onDelete: 'cascade' }),

  content: text().notNull(),
  authorId: text().notNull(),
  createdAt: timestamp().notNull().defaultNow(),

  isPinned: boolean().default(false),
  isInternal: boolean().default(false),
}, (table) => ({
  idxTicketId: index().on(table.ticketId),
  idxAuthorId: index().on(table.authorId),
  idxCreatedAt: index().on(table.createdAt),
}));

export const ticketAttachments = sqliteTable('ticket_attachments', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  ticketId: text().notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  messageId: text().references(() => ticketMessages.id, { onDelete: 'cascade' }),

  fileName: text().notNull(),
  fileSize: integer().notNull(),
  mimeType: text(),

  storageUrl: text().notNull(),
  storageProvider: text(),

  uploadedBy: text().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  idxTicketId: index().on(table.ticketId),
}));

export const ticketCategories = sqliteTable('ticket_categories', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  organizationId: text().notNull(),
  name: text().notNull(),
  description: text(),
  color: text(),

  slaHoursDefault: integer(),
  queueIds: text(),                           // JSON string

  createdAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  uniqueOrgName: uniqueIndex().on(table.organizationId, table.name),
  idxOrganizationId: index().on(table.organizationId),
}));

export const ticketQueues = sqliteTable('ticket_queues', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  organizationId: text().notNull(),
  name: text().notNull(),
  description: text(),

  agentIds: text().notNull(),                 // JSON string array

  roundRobin: boolean().default(false),
  maxPerAgent: integer(),

  createdAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  uniqueOrgQueueName: uniqueIndex().on(table.organizationId, table.name),
  idxOrganizationId: index().on(table.organizationId),
}));

export const ticketAssignments = sqliteTable('ticket_assignments', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  ticketId: text().notNull(),
  assignedTo: text().notNull(),
  assignedBy: text().notNull(),
  reason: text(),
  assignedAt: timestamp().notNull().defaultNow(),
  unassignedAt: timestamp(),
}, (table) => ({
  idxTicketId: index().on(table.ticketId),
  idxAssignedTo: index().on(table.assignedTo),
  idxAssignedAt: index().on(table.assignedAt),
}));

export const ticketSla = sqliteTable('ticket_sla', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  ticketId: text().notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  categoryId: text(),

  deadline: timestamp().notNull(),
  breached: boolean().default(false),
  breachedAt: timestamp(),

  createdAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  idxTicketId: index().on(table.ticketId),
  idxDeadline: index().on(table.deadline),
}));

// Relations
export const ticketsRelations = relations(tickets, ({ many }) => ({
  history: many(ticketHistory),
  messages: many(ticketMessages),
  attachments: many(ticketAttachments),
  assignments: many(ticketAssignments),
  sla: many(ticketSla),
}));

export const ticketHistoryRelations = relations(ticketHistory, ({ one }) => ({
  ticket: one(tickets, {
    fields: [ticketHistory.ticketId],
    references: [tickets.id],
  }),
}));

export const ticketMessagesRelations = relations(ticketMessages, ({ one, many }) => ({
  ticket: one(tickets, {
    fields: [ticketMessages.ticketId],
    references: [tickets.id],
  }),
  attachments: many(ticketAttachments),
}));

export const ticketAttachmentsRelations = relations(ticketAttachments, ({ one }) => ({
  ticket: one(tickets, {
    fields: [ticketAttachments.ticketId],
    references: [tickets.id],
  }),
  message: one(ticketMessages, {
    fields: [ticketAttachments.messageId],
    references: [ticketMessages.id],
  }),
}));
```

### 5.3 TicketingProvider Implementation

```typescript
// packages/mastra-engine/src/agent/communication/ticketing-provider.ts

import { CommunicationProvider, Message, Conversation } from './types';
import { db } from '../db';
import { tickets, ticketMessages, ticketHistory, ticketAttachments } from '../db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

export class TicketingProvider implements CommunicationProvider {
  async initialize(): Promise<void> {
    // Migrations and setup would be handled by Drizzle migrate
    console.log('TicketingProvider initialized');
  }

  async sendMessage(
    to: string,  // ticketId or 'new:category:org'
    content: string,
    options?: {
      ticketId?: string;
      internal?: boolean;
      authorId?: string;
    }
  ): Promise<string> {
    const authorId = options?.authorId || 'system';

    // Create ticket if 'to' is 'new'
    let ticketId = options?.ticketId || to;

    if (to.startsWith('new:')) {
      // Parse: 'new:bug-report:org-123'
      const [_, category, organizationId] = to.split(':');
      ticketId = await this.createTicket({
        organizationId,
        title: content.substring(0, 100),
        description: content,
        category,
        createdBy: authorId,
      });
    }

    // Add message/comment to ticket
    const messageId = uuid();
    await db.insert(ticketMessages).values({
      id: messageId,
      ticketId,
      content,
      authorId,
      isInternal: options?.internal || false,
      createdAt: new Date(),
    });

    // Update ticket's lastMessageAt
    await db
      .update(tickets)
      .set({
        updatedAt: new Date(),
        lastMessageAt: new Date(),
      })
      .where(eq(tickets.id, ticketId));

    return messageId;
  }

  async getConversations(
    filter?: {
      organizationId?: string;
      assignedTo?: string;
      status?: string;
      search?: string;
    }
  ): Promise<Conversation[]> {
    let query = db.select().from(tickets);

    if (filter?.organizationId) {
      query = query.where(eq(tickets.organizationId, filter.organizationId));
    }

    if (filter?.assignedTo) {
      query = query.where(eq(tickets.assignedTo, filter.assignedTo));
    }

    if (filter?.status) {
      query = query.where(eq(tickets.status, filter.status));
    }

    const results = await query.orderBy(desc(tickets.createdAt));

    return results.map(ticket => ({
      id: ticket.id,
      name: ticket.title,
      participants: [ticket.createdBy, ...(ticket.assignedTo ? [ticket.assignedTo] : [])],
      lastMessageAt: ticket.lastMessageAt,
      messageCount: ticket.lastMessageAt ? 1 : 0, // Simplified
      metadata: {
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        ticketNumber: ticket.ticketNumber,
      },
    }));
  }

  async getMessages(
    conversationId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Message[]> {
    const messages = await db
      .select()
      .from(ticketMessages)
      .where(eq(ticketMessages.ticketId, conversationId))
      .orderBy(asc(ticketMessages.createdAt))
      .limit(options?.limit || 50)
      .offset(options?.offset || 0);

    return messages.map(msg => ({
      id: msg.id,
      content: msg.content,
      author: msg.authorId,
      timestamp: msg.createdAt,
      metadata: {
        internal: msg.isInternal,
        pinned: msg.isPinned,
      },
    }));
  }

  async createTicket(params: {
    organizationId: string;
    title: string;
    description: string;
    category: string;
    priority?: string;
    createdBy: string;
    assignedTo?: string;
  }): Promise<string> {
    const ticketId = uuid();
    const ticketNumber = await this.generateTicketNumber(params.organizationId);

    await db.insert(tickets).values({
      id: ticketId,
      ticketNumber,
      organizationId: params.organizationId,
      title: params.title,
      description: params.description,
      category: params.category,
      priority: params.priority || 'medium',
      status: 'open',
      createdBy: params.createdBy,
      assignedTo: params.assignedTo,
      assignedAt: params.assignedTo ? new Date() : null,
      createdAt: new Date(),
    });

    // Create first history entry
    await db.insert(ticketHistory).values({
      id: uuid(),
      ticketId,
      action: 'created',
      changedBy: params.createdBy,
      createdAt: new Date(),
      description: 'Ticket created',
    });

    // Apply SLA
    await this.applySla(ticketId, params.category);

    return ticketId;
  }

  async updateTicket(
    ticketId: string,
    changes: {
      status?: string;
      priority?: string;
      assignedTo?: string;
      notes?: string;
    }
  ): Promise<void> {
    const ticket = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1)
      .then(r => r[0]);

    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    const updates: any = { updatedAt: new Date() };
    const historyEntries: any[] = [];

    // Track changes for history
    if (changes.status && changes.status !== ticket.status) {
      updates.status = changes.status;
      historyEntries.push({
        fieldName: 'status',
        oldValue: ticket.status,
        newValue: changes.status,
      });
    }

    if (changes.priority && changes.priority !== ticket.priority) {
      updates.priority = changes.priority;
      historyEntries.push({
        fieldName: 'priority',
        oldValue: ticket.priority,
        newValue: changes.priority,
      });
    }

    if (changes.assignedTo && changes.assignedTo !== ticket.assignedTo) {
      updates.assignedTo = changes.assignedTo;
      updates.assignedAt = new Date();
      historyEntries.push({
        fieldName: 'assigned_to',
        oldValue: ticket.assignedTo,
        newValue: changes.assignedTo,
      });
    }

    if (changes.notes) {
      // Add as message comment
      await this.sendMessage(ticketId, changes.notes, {
        internal: true,
        authorId: 'system',
      });
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      await db.update(tickets).set(updates).where(eq(tickets.id, ticketId));
    }

    // Record history
    for (const entry of historyEntries) {
      await db.insert(ticketHistory).values({
        id: uuid(),
        ticketId,
        action: entry.fieldName === 'status' ? 'status_changed' : 'assigned',
        fieldName: entry.fieldName,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        changedBy: 'system',
        createdAt: new Date(),
      });
    }
  }

  async resolveTicket(
    ticketId: string,
    resolution: {
      notes: string;
      satisfactionRating?: number;
    }
  ): Promise<void> {
    const now = new Date();

    await db
      .update(tickets)
      .set({
        status: 'resolved',
        resolvedAt: now,
        resolvedBy: 'system',
        resolutionNotes: resolution.notes,
        satisfactionRating: resolution.satisfactionRating,
      })
      .where(eq(tickets.id, ticketId));

    await db.insert(ticketHistory).values({
      id: uuid(),
      ticketId,
      action: 'resolved',
      changedBy: 'system',
      createdAt: now,
      description: 'Ticket resolved',
    });
  }

  // Helper: Generate sequential ticket number
  private async generateTicketNumber(organizationId: string): Promise<string> {
    const lastTicket = await db
      .select({ ticketNumber: tickets.ticketNumber })
      .from(tickets)
      .where(eq(tickets.organizationId, organizationId))
      .orderBy(desc(tickets.ticketNumber))
      .limit(1)
      .then(r => r[0]);

    const lastNumber = lastTicket
      ? parseInt(lastTicket.ticketNumber.replace('TKT-', ''))
      : 0;

    return `TKT-${String(lastNumber + 1).padStart(6, '0')}`;
  }

  // Helper: Apply SLA based on category
  private async applySla(ticketId: string, category: string): Promise<void> {
    // Lookup default SLA from category config
    // For now, default to 48 hours
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + 48);

    // Would insert into ticket_sla table
  }
}
```

### 5.4 Agent Tools para Tickets

```typescript
// packages/mastra-engine/src/agent/tools/ticketing-tools.ts

import { Tool } from '../../types';
import { TicketingProvider } from '../communication/ticketing-provider';

const ticketingProvider = new TicketingProvider();

export const createTicketTool: Tool = {
  name: 'createTicket',
  description: 'Create a support ticket for your application',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Ticket title' },
      description: { type: 'string', description: 'Detailed description' },
      category: { type: 'string', description: 'Category: bug, feature, support, billing' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Priority level' },
      assignedTo: { type: 'string', description: 'Assign to agent ID (optional)' },
    },
    required: ['title', 'description', 'category'],
  },
  execute: async (input: any, context: any) => {
    const organizationId = context.agentMetadata.organizationId;
    const agentId = context.agentId;

    const ticketId = await ticketingProvider.createTicket({
      organizationId,
      title: input.title,
      description: input.description,
      category: input.category,
      priority: input.priority || 'medium',
      createdBy: agentId,
      assignedTo: input.assignedTo,
    });

    return {
      success: true,
      ticketId,
      ticketNumber: `TKT-${ticketId.substring(0, 6)}`, // Simplified
    };
  },
};

export const updateTicketTool: Tool = {
  name: 'updateTicket',
  description: 'Update an existing ticket',
  parameters: {
    type: 'object',
    properties: {
      ticketId: { type: 'string', description: 'Ticket ID' },
      status: { type: 'string', enum: ['open', 'in-progress', 'waiting', 'resolved', 'closed'] },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
      assignedTo: { type: 'string', description: 'Reassign to agent ID' },
      notes: { type: 'string', description: 'Add comment/note' },
    },
    required: ['ticketId'],
  },
  execute: async (input: any, context: any) => {
    await ticketingProvider.updateTicket(input.ticketId, {
      status: input.status,
      priority: input.priority,
      assignedTo: input.assignedTo,
      notes: input.notes,
    });

    return { success: true, ticketId: input.ticketId };
  },
};

export const resolveTicketTool: Tool = {
  name: 'resolveTicket',
  description: 'Resolve and close a ticket',
  parameters: {
    type: 'object',
    properties: {
      ticketId: { type: 'string', description: 'Ticket ID' },
      resolutionNotes: { type: 'string', description: 'How was it resolved?' },
      satisfactionRating: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    },
    required: ['ticketId', 'resolutionNotes'],
  },
  execute: async (input: any, context: any) => {
    await ticketingProvider.resolveTicket(input.ticketId, {
      notes: input.resolutionNotes,
      satisfactionRating: input.satisfactionRating,
    });

    return { success: true, ticketId: input.ticketId };
  },
};

export const listTicketsTool: Tool = {
  name: 'listTickets',
  description: 'List tickets for your application',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', description: 'Filter by status' },
      assignedTo: { type: 'string', description: 'Filter by assignee (default: current agent)' },
      category: { type: 'string', description: 'Filter by category' },
      priority: { type: 'string', description: 'Filter by priority' },
      search: { type: 'string', description: 'Search in title/description' },
      limit: { type: 'integer', description: 'Max results (default: 50)' },
    },
  },
  execute: async (input: any, context: any) => {
    const organizationId = context.agentMetadata.organizationId;
    const agentId = context.agentId;

    const conversations = await ticketingProvider.getConversations({
      organizationId,
      assignedTo: input.assignedTo || agentId,
      status: input.status,
      search: input.search,
    });

    return {
      success: true,
      tickets: conversations.slice(0, input.limit || 50),
      total: conversations.length,
    };
  },
};
```

---

## 6. Plano de Implementação

### Fase 1: Infraestrutura de Banco de Dados (Sprint 1)
- [ ] Definir schema completo do Drizzle (7 tabelas: tickets, history, messages, attachments, categories, queues, sla)
- [ ] Criar migrations Drizzle para nova tabelas
- [ ] Configurar índices para performance
- [ ] Setup de testes para schema

### Fase 2: TicketingProvider Core (Sprint 2)
- [ ] Implementar TicketingProvider classe (extends CommunicationProvider)
- [ ] Métodos básicos: createTicket, getConversations, getMessages, sendMessage
- [ ] Implementar número sequencial de tickets
- [ ] Testes unitários do provider

### Fase 3: Agent Tools (Sprint 3)
- [ ] Implementar createTicketTool, updateTicketTool, resolveTicketTool, listTicketsTool
- [ ] Integrar tools no runtime do agent
- [ ] Testes de integração com agent context
- [ ] Autorização/isolamento multi-tenant

### Fase 4: Roteamento e SLA (Sprint 4)
- [ ] Implementar sistema de queues
- [ ] Implementar roteamento automático de tickets
- [ ] Implementar SLA tracking e alertas
- [ ] Testes de roteamento e SLA

### Fase 5: Integração Multi-Provider (Sprint 5)
- [ ] Notificações via email quando ticket criado
- [ ] Notificações via Discord
- [ ] Integração com Group Chat (criar/atualizar tickets de grupo)
- [ ] Testes de notificação

### Fase 6: Auditoria e Compliance (Sprint 6)
- [ ] Implementar ticket_history completo
- [ ] Implementar auditoria de mudanças
- [ ] Imutabilidade de histórico (append-only)
- [ ] Testes de auditoria

---

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|--------|-----------|
| Performance degradação com 10k+ tickets | Média | Alto | Índices apropriados, paginação obrigatória, arquivar tickets antigos |
| Multi-tenant data leakage | Baixa | CRÍTICO | Validação rigorosa de organization_id em todas as queries |
| Notificações duplicadas (ticket + email + Discord) | Média | Médio | Idempotency keys para notificações, deduplicação |
| SLA breaches incorretos | Média | Médio | Testes de SLA calculation, auditoria de timestamps |
| Roteamento automático causa overload | Média | Alto | Limite por agente, monitoramento de carga |
| Perda de histórico de ticket | Baixa | CRÍTICO | Append-only log, transações atômicas, backups |

---

## 8. Métricas de Sucesso

### Técnicas
- [ ] Listar 100 tickets < 200ms
- [ ] Criar ticket < 100ms
- [ ] Suporta 10k+ tickets por org
- [ ] Histórico append-only, zero perda de dados
- [ ] 99.9% de notificações entregues

### Funcionais
- [ ] Agentes podem criar/atualizar/resolver tickets
- [ ] Roteamento automático de tickets funciona
- [ ] SLA tracking e alertas funcionam
- [ ] Notificações multi-provider funcionam
- [ ] Group chat integrado com tickets

### de Negócio
- [ ] Agentes conseguem suportar seus clientes via tickets
- [ ] Reduzir tempo de resposta (via SLA enforcement)
- [ ] Aumentar satisfação de clientes (rating)
- [ ] Escalabilidade para suportar múltiplas orgs

---

## 9. Dependências Externas

### Internas
- Communication Provider Interface (PRD-02)
- Group Chat Module (PRD-09, PRD-10)
- Provider Configuration System (PRD-02)
- Drizzle ORM (PRD-02)

### Externas
- Node.js crypto (para hashing de attachments - futuro)
- Storage provider para attachments (S3, local, etc - Phase 2)

---

## 10. Estimativas

### Tamanho da Feature
**Esforço total:** ~120-150 horas (6 sprints)

### Breakdown por Fase
1. **Phase 1 (DB Schema):** 15h
2. **Phase 2 (Core Provider):** 25h
3. **Phase 3 (Agent Tools):** 20h
4. **Phase 4 (Roteamento/SLA):** 25h
5. **Phase 5 (Multi-Provider):** 30h
6. **Phase 6 (Auditoria):** 15h

### Story Points (Fibonacci)
- Epic PRD-24: 60 story points (6 sprints, ~1.5 devs)

---

## 11. Documentação Necessária

### Para Desenvolvedores
1. `docs/implementation/ticketing-provider-setup.md` — Setup completo
2. `docs/implementation/ticketing-schema.md` — Schema reference
3. `docs/implementation/ticketing-tools-api.md` — Agent tools API
4. `docs/implementation/ticket-routing.md` — Roteamento de tickets
5. `docs/implementation/sla-configuration.md` — Configuração de SLA

### Para Operadores
1. `docs/operations/ticket-management.md` — Gerenciar tickets
2. `docs/operations/sla-monitoring.md` — Monitorar SLA compliance
3. `docs/operations/ticket-escalation.md` — Escalação de tickets

### Para Usuários/Agentes
1. Exemplos de uso de tools em agent code

---

## 12. Critérios de Aceitação

- [ ] Schema Drizzle completo e migrations rodadas
- [ ] TicketingProvider implementado com CommunicationProvider interface
- [ ] Número sequencial de tickets funcionando (TKT-001, TKT-002, etc)
- [ ] Agent tools (create, update, resolve, list) implementados e testados
- [ ] Tickets persistem no banco de dados corretamente
- [ ] Histórico de mudanças é immutable (append-only)
- [ ] Multi-tenant isolation testada (agents não veem tickets de outras orgs)
- [ ] SLA deadline calculado e rastreado
- [ ] Notificações multi-provider funcionam (email, Discord)
- [ ] Group chat integrado (criar/atualizar tickets de grupo)
- [ ] Roteamento automático de tickets
- [ ] Auditoria completa com timestamps
- [ ] Performance tested (200ms para list 100 tickets, 100ms para create)
- [ ] Documentação completa

---

## 13. Próximos Passos Recomendados

### Imediato (Antes de iniciar Phase 1)
1. **Revisar com time:** Apresentar PRD para architectural review
2. **Definir storage de attachments:** S3, local, ou outro?
3. **Integração com payment:** Como billing queda integrada com tickets?
4. **Notificação de SLA:** Qual canal usar para alertas?

### Após Phase 1
1. **Dashboard de tickets:** UI/UX para gerenciar tickets (Phase 2)
2. **ML-based classification:** Classificação automática de tickets
3. **Webhooks:** Notificações push para agentes
4. **Integração com terceiros:** Jira, Zendesk, ServiceNow (Phase 3)

### Longo Prazo
1. **Chatbot de resolução:** FAQ automático para tickets comuns
2. **Analytics de tickets:** Dashboard de métricas
3. **Backup/restore:** Sistema de backup de tickets
4. **Arquivamento:** Política de retenção de tickets

---

**Preparado por:** Análise Detalhada (Agent)
**Data:** 2026-03-15
**Próxima revisão:** Após Phase 1 (discussão técnica)

---

## Apêndice A: Exemplo de Uso End-to-End

### Scenario: Agent criando ticket via aplicação

```typescript
// 1. Registrar TicketingProvider
const communication = new CommunicationModule();
const ticketingProvider = new TicketingProvider();
await communication.registerProvider('ticketing', ticketingProvider);

// 2. Criar agente com ticket tools
const agent = await createForgeAgent({
  agentId: 'agent-sales-001',
  organizationId: 'org-acme',
  name: 'Sales Support Agent',
  tools: [
    createTicketTool,
    updateTicketTool,
    resolveTicketTool,
    listTicketsTool,
  ],
});

// 3. Agent executa tool para criar ticket
await agent.executeTask({
  toolName: 'createTicket',
  input: {
    title: 'Login page not loading',
    description: 'User reports white screen on login page in Chrome',
    category: 'bug',
    priority: 'high',
    assignedTo: 'agent-dev-001',
  },
});
// Output: { ticketId: 'uuid-123', ticketNumber: 'TKT-001' }

// 4. Notificações são enviadas automaticamente
// → Email: agent-dev-001@company.com
// → Discord: #support channel
// → Group chat: If agent is in support group

// 5. Developer agent recebe ticket e trabalha nele
const devAgent = await createForgeAgent({
  agentId: 'agent-dev-001',
  organizationId: 'org-acme',
});

// Lista seus tickets
await devAgent.executeTask({
  toolName: 'listTickets',
  input: {
    assignedTo: 'agent-dev-001',
    status: 'open',
  },
});

// Atualiza ticket com progresso
await devAgent.executeTask({
  toolName: 'updateTicket',
  input: {
    ticketId: 'uuid-123',
    status: 'in-progress',
    notes: 'Found issue in auth service, working on fix',
  },
});

// Resolve ticket
await devAgent.executeTask({
  toolName: 'resolveTicket',
  input: {
    ticketId: 'uuid-123',
    resolutionNotes: 'Fixed CORS issue in auth service. Deployed v1.2.3',
    satisfactionRating: 5,
  },
});

// 6. Ticket history:
// TKT-001
// - Created by: agent-sales-001
// - Status: open → in-progress → resolved
// - Updated by: agent-dev-001
// - Timeline: 2h 15min (within 4h SLA)
```

---

**FIM DO DOCUMENTO**

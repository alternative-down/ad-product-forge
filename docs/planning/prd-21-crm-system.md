# PRD 21: CRM System

**Status:** Draft - Detailed Analysis and Planning
**Data:** 2026-03-15
**Versão:** 1.0
**Responsável:** Business Operations & Database Team

---

## Resumo Executivo

### Objetivo Principal
Implementar um sistema CRM (Customer Relationship Management) integrado com o ERP que permite aos agentes rastrear, gerenciar e otimizar relacionamentos com clientes, automátizando pipeline de vendas e capturando dados críticos de interação para inteligência empresarial.

### Proposta de Valor
1. **Centralização de Dados:** Todos os dados de cliente em um único repositório conectado ao ERP
2. **Automação de Pipeline:** Rastreamento automático de oportunidades e estágios de vendas
3. **Inteligência de Relacionamento:** Histórico completo de interações, comunicações e transações
4. **Escalabilidade:** Suportar múltiplos clientes, contas e oportunidades sem limites de dados
5. **Integração ERP:** Sincronização bidirecional com sistema ERP para processos unificados

### Escopo da Feature
- Implementar tabelas de banco de dados para clientes, contas, contatos e oportunidades
- Criar sistema de rastreamento de interações (emails, chamadas, reuniões, transações)
- Implementar pipeline de vendas com estágios configuráveis
- Desenvolver API para operações CRUD de clientes e oportunidades
- Integrar com sistema de comunicação para captura automática de interações
- Criar relatórios e dashboards de performance de vendas
- Implementar sincronização com ERP para dados de transação
- Suportar gerenciamento de contas (múltiplos contatos por cliente)

### Não está no Escopo
- Interface UI completa de dashboard (Phase 2)
- Previsão preditiva com ML (Phase 2)
- Integração com CRM terceiros (Salesforce, HubSpot) - Phase 3
- Automação avançada de email marketing
- Análise de sentimento em comunicações
- Integração com sistemas de telefonia
- Gerenciamento de ativos/documentos de cliente

---

## 2. Contexto Técnico Atual

### Arquitetura Existente

#### Estrutura Atual do Sistema
```
Runtime (createAgent/createForgeAgent)
  ├─ Communication Module
  │  ├─ Store (LibSQL + Drizzle ORM)
  │  │  ├─ accounts, contacts, contact_accounts
  │  │  ├─ conversations, messages
  │  │  └─ (Sem dados de opportunity/pipeline)
  │  ├─ Provider Registry
  │  └─ Agent-facing tools
  │
  ├─ ERP Module (futuro/parcial)
  │  ├─ Customer data
  │  ├─ Orders/Transactions
  │  └─ Inventory (não coberto por CRM)
  │
  └─ CRM Module (a implementar)
     ├─ Store (Drizzle ORM)
     ├─ Clientes, Contas, Contatos, Oportunidades
     ├─ Pipeline de Vendas
     ├─ Histórico de Interações
     └─ Integração com Communication Module
```

#### Problema Identificado
1. **Dados Fragmentados:** Informações de cliente espalhadas entre communication e ERP
2. **Sem Pipeline:** Não há rastreamento de oportunidades ou estágios de vendas
3. **Sem Histórico Unificado:** Interações não são ligadas a clientes/oportunidades
4. **Sem Sincronização:** ERP e communication não compartilham dados de cliente
5. **Sem Métricas:** Impossível gerar relatórios de performance de vendas

### Stack Técnico Atual
- **Runtime:** Node.js + TypeScript
- **ORM:** Drizzle ORM (implementado para communication)
- **Database:** LibSQL (SQLite-compatible)
- **API:** REST via agent tools

### Dependências Existentes
- `@libsql/client` — Database client
- `drizzle-orm` — ORM
- `zod` — Schema validation
- Communication Module com provider registry

---

## 3. Requisitos Funcionais

### 3.1 Gerenciamento de Clientes e Contas

**RF-1: Modelo de Cliente**
- Armazenar informações de cliente:
  - ID único (UUID)
  - Nome/razão social
  - Email, telefone
  - Endereço (rua, cidade, estado, CEP)
  - Tipo de cliente (pessoa física, pessoa jurídica)
  - Segmento/indústria
  - Status (ativo, inativo, bloqueado)
  - Rating/score de valor
  - Data de criação e última atualização
  - Tags/categorias customizáveis

**RF-2: Modelo de Conta**
- Contas associadas a clientes:
  - ID único, referência ao cliente
  - Nome da conta
  - Responsável (agente)
  - Status da conta (prospect, cliente, inativo)
  - Data de início do relacionamento
  - Valor total de negócios (LTV - Lifetime Value)
  - Próxima data de contato recomendada
  - Prioridade (alta, média, baixa)

**RF-3: Modelo de Contato**
- Múltiplos contatos por cliente:
  - Nome, cargo, departamento
  - Email, telefone, celular
  - Dados de rede social (LinkedIn, etc)
  - Nível de influência/decisão (tomador de decisão, influenciador, usuário)
  - Data da última interação
  - Preferências de comunicação

**RF-4: Busca e Filtro de Clientes**
- Buscar clientes por:
  - Nome, email, telefone
  - Status, segmento, tags
  - Data de criação/atualização
  - Responsável (agente)
- Suportar queries complexas com múltiplos filtros

### 3.2 Pipeline de Vendas e Oportunidades

**RF-5: Modelo de Oportunidade**
- Rastrear oportunidades de venda:
  - ID único, referência a cliente/conta/contato
  - Título da oportunidade
  - Descrição/detalhes
  - Valor estimado (currency-aware)
  - Estágio (configurável por empresa: prospecting, qualification, proposal, negotiation, closed-won, closed-lost)
  - Probabilidade de fechamento (%)
  - Data de criação
  - Data de fechamento esperada (close date)
  - Data de fechamento real (para oportunidades fechadas)
  - Responsável (agente/vendedor)
  - Produtos/serviços associados
  - Notas e histórico de mudanças

**RF-6: Pipeline de Vendas**
- Visualizar e gerenciar pipeline:
  - Oportunidades agrupadas por estágio
  - Valor total por estágio
  - Contagem de oportunidades por estágio
  - Movimentação entre estágios (drag-drop via API)
  - Histórico de transições de estágio
  - Alertas para oportunidades em risco (sem atualização)

**RF-7: Configuração de Estágios**
- Permitir definir estágios de pipeline customizados:
  - Nome do estágio
  - Ordem de sequência
  - Probabilidade padrão de fechamento
  - Cor/identificação visual
  - Ações automáticas ao entrar/sair do estágio

### 3.3 Rastreamento de Interações

**RF-8: Modelo de Interação**
- Capturar todas as interações com cliente:
  - ID único, referência a cliente/contato/oportunidade
  - Tipo (email, chamada, reunião, transação, nota)
  - Canal (email, Discord, Slack, Whatsapp, SMS, ligação)
  - Data/hora da interação
  - Duração (para chamadas/reuniões)
  - Participantes (agente, contato cliente)
  - Conteúdo/descrição
  - Resultado/outcome (positivo, neutro, negativo)
  - Próxima ação recomendada
  - Ligações a documentos/arquivos

**RF-9: Captura Automática de Interações**
- Integrar com Communication Module:
  - Emails capturados automaticamente
  - Mensagens de Discord/Slack ligadas a clientes
  - Transações do ERP ligadas a oportunidades
  - Conversas de chat vinculadas a contatos
- Permitir manual logging de interações (reuniões, chamadas)

**RF-10: Timeline de Cliente**
- Visualizar linha do tempo de todas as interações:
  - Ordenado cronologicamente
  - Filtrado por tipo de interação
  - Mostrando participantes e resultados
  - Ligações a oportunidades/contas

### 3.4 Integração com ERP

**RF-11: Sincronização de Dados de Cliente**
- Sincronização bidirecional com ERP:
  - Clientes CRM → Clientes ERP (master no CRM)
  - Transações ERP → Histórico de Interações CRM
  - Valor de pedidos → Atualizar LTV de cliente
  - Status de pagamento → Atualizar score de cliente

**RF-12: Ligação de Oportunidades a Pedidos**
- Quando oportunidade é fechada (closed-won):
  - Criar pedido no ERP automaticamente
  - Ou: Ligar a pedido existente se já criado
  - Rastrear status do pedido/fulfillment

**RF-13: Sincronização de Transações**
- Capturar dados de transação do ERP:
  - Número do pedido, data, valor
  - Itens/produtos
  - Status do pedido
  - Data de entrega esperada/real
  - Vincular a oportunidade correspondente

### 3.5 Análise e Relatórios

**RF-14: Métricas Básicas**
- Calcular e expor métricas:
  - Total de clientes por status
  - Valor total de oportunidades abertas
  - Quantidade de oportunidades por estágio
  - Taxa de conversão por estágio
  - Tempo médio entre estágios
  - Receita mensal (closed-won)
  - Forecast de receita (baseado em probabilidade)

**RF-15: Filtros de Análise**
- Agrupar métricas por:
  - Período de tempo (dia, mês, trimestre, ano)
  - Agente/responsável
  - Segmento de cliente
  - Estágio de oportunidade
  - Canal de comunicação

### 3.6 Configuração e Customização

**RF-16: Modelos de Dados Customizáveis**
- Permitir campos customizados:
  - Adicionar campos customizados a cliente/conta/contato/oportunidade
  - Tipos suportados: texto, número, data, dropdown, booleano
  - Validação por tipo
  - Obrigatoriedade configurável

**RF-17: Regras de Automação**
- Definir regras simples de automação (Phase 1 básico):
  - Quando oportunidade criada → criar tarefa para agente
  - Quando cliente inativo por X dias → alertar
  - Quando oportunidade em determinado estágio → enviar email
  - Quando transação do ERP → atualizar LTV

---

## 4. Requisitos Não-Funcionais

### 4.1 Performance
- **RNF-1:** Busca de clientes < 100ms (com índices)
- **RNF-2:** Carga de pipeline < 200ms (até 10k oportunidades)
- **RNF-3:** Síncronização ERP < 5s (batch processing)
- **RNF-4:** Queries compiladas com prepared statements

### 4.2 Segurança
- **RNF-5:** Dados de cliente isolados por tenant (se multi-tenant futura)
- **RNF-6:** Auditoria de acesso a dados (quem leu/modificou cliente)
- **RNF-7:** Sem exposição de email/telefone em logs
- **RNF-8:** SQL injection prevention via Drizzle

### 4.3 Auditoria
- **RNF-9:** Timestamp (UTC) em toda mudança
- **RNF-10:** Rastrear agent_id em operações
- **RNF-11:** Histórico de mudanças (audit trail)
- **RNF-12:** Soft delete de clientes (mark inactive, não hard delete)

### 4.4 Escalabilidade
- **RNF-13:** Suportar 100k+ clientes
- **RNF-14:** Suportar 1M+ oportunidades/interações
- **RNF-15:** Índices apropriados para queries frequentes
- **RNF-16:** Particionamento de histórico (por data) se necessário

### 4.5 Confiabilidade
- **RNF-17:** Transações ACID para operações críticas (create oportunidade + update cliente)
- **RNF-18:** Retry logic para sincronização ERP (exponential backoff)
- **RNF-19:** Consistência de dados entre CRM e ERP (eventual consistency aceitável)
- **RNF-20:** Backup automático de dados de cliente

### 4.6 Compatibilidade
- **RNF-21:** Não quebrar API de communication module
- **RNF-22:** Não quebrar agent-facing tools existentes

---

## 5. Arquitetura da Solução

### 5.1 Novas Tabelas de Banco de Dados

```sql
-- Tabela de clientes
CREATE TABLE customers (
  id TEXT PRIMARY KEY,                    -- uuid
  name TEXT NOT NULL,                     -- Razão social ou nome
  email TEXT,
  phone TEXT,
  address TEXT,                           -- Endereço completo (JSON)
  customer_type TEXT,                     -- 'pf' (pessoa física), 'pj' (pessoa jurídica)
  segment TEXT,                           -- Segmento/indústria
  status TEXT NOT NULL,                   -- 'active', 'inactive', 'blocked'
  customer_score INTEGER DEFAULT 0,       -- Score de valor (0-100)
  ltv_total REAL DEFAULT 0,              -- Lifetime Value total
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT,                          -- JSON para dados customizados

  INDEX idx_email (email),
  INDEX idx_status (status),
  INDEX idx_segment (segment),
  INDEX idx_created_at (created_at)
);

-- Tabela de contas (relacionamento com agente)
CREATE TABLE customer_accounts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  account_name TEXT,
  account_status TEXT,                    -- 'prospect', 'customer', 'inactive'
  responsible_agent_id TEXT,
  priority TEXT,                          -- 'high', 'medium', 'low'
  ltv_account REAL DEFAULT 0,
  last_contact_at TIMESTAMP,
  next_contact_recommended TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (customer_id) REFERENCES customers(id),
  INDEX idx_customer_id (customer_id),
  INDEX idx_agent_id (agent_id),
  INDEX idx_account_status (account_status)
);

-- Tabela de contatos
CREATE TABLE customer_contacts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  job_title TEXT,
  department TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  decision_level TEXT,                    -- 'decision_maker', 'influencer', 'user'
  last_interaction_at TIMESTAMP,
  communication_preference TEXT,           -- JSON: { email, phone, slack, etc }
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (customer_id) REFERENCES customers(id),
  INDEX idx_customer_id (customer_id),
  INDEX idx_email (email)
);

-- Tabela de oportunidades
CREATE TABLE opportunities (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  account_id TEXT,
  contact_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  value REAL,                             -- Valor estimado em moeda
  currency TEXT DEFAULT 'BRL',            -- ISO currency code
  stage TEXT NOT NULL,                    -- 'prospecting', 'qualification', 'proposal', etc
  probability INTEGER DEFAULT 50,         -- 0-100
  close_date_expected TIMESTAMP,
  close_date_actual TIMESTAMP,
  responsible_agent_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  products TEXT,                          -- JSON array of product references
  metadata TEXT,                          -- JSON para dados customizados

  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (account_id) REFERENCES customer_accounts(id),
  FOREIGN KEY (contact_id) REFERENCES customer_contacts(id),
  INDEX idx_customer_id (customer_id),
  INDEX idx_stage (stage),
  INDEX idx_responsible_agent_id (responsible_agent_id),
  INDEX idx_close_date (close_date_expected)
);

-- Tabela de estágios customizáveis
CREATE TABLE pipeline_stages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  probability_default INTEGER DEFAULT 50,
  color TEXT,                             -- Cor visual (hex)
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (sequence),
  INDEX idx_sequence (sequence)
);

-- Tabela de interações
CREATE TABLE customer_interactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  contact_id TEXT,
  account_id TEXT,
  opportunity_id TEXT,
  agent_id TEXT NOT NULL,
  interaction_type TEXT NOT NULL,         -- 'email', 'call', 'meeting', 'transaction', 'note'
  channel TEXT,                           -- 'email', 'discord', 'slack', 'sms', 'call', etc
  subject TEXT,
  content TEXT,
  outcome TEXT,                           -- 'positive', 'neutral', 'negative'
  duration_minutes INTEGER,               -- Para chamadas/reuniões
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  interaction_date TIMESTAMP NOT NULL,
  next_action TEXT,

  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (contact_id) REFERENCES customer_contacts(id),
  FOREIGN KEY (account_id) REFERENCES customer_accounts(id),
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id),
  INDEX idx_customer_id (customer_id),
  INDEX idx_interaction_date (interaction_date),
  INDEX idx_type (interaction_type),
  INDEX idx_agent_id (agent_id)
);

-- Tabela de histórico de estágios (auditoria)
CREATE TABLE opportunity_stage_history (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  stage_from TEXT,
  stage_to TEXT NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  changed_by_agent_id TEXT,
  notes TEXT,

  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id),
  INDEX idx_opportunity_id (opportunity_id),
  INDEX idx_changed_at (changed_at)
);

-- Tabela de transações do ERP (referência)
CREATE TABLE customer_transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  account_id TEXT,
  opportunity_id TEXT,
  erp_order_id TEXT UNIQUE,                -- ID do pedido no ERP
  amount REAL,
  currency TEXT DEFAULT 'BRL',
  status TEXT,                             -- 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'
  order_date TIMESTAMP,
  expected_delivery_date TIMESTAMP,
  actual_delivery_date TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_from_erp_at TIMESTAMP,

  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (account_id) REFERENCES customer_accounts(id),
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id),
  INDEX idx_customer_id (customer_id),
  INDEX idx_erp_order_id (erp_order_id),
  INDEX idx_status (status)
);

-- Tabela de auditoria
CREATE TABLE crm_audit_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,              -- 'customer', 'opportunity', 'interaction', etc
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,                   -- 'created', 'updated', 'deleted'
  agent_id TEXT,
  changes TEXT,                           -- JSON diff
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_entity_type (entity_type),
  INDEX idx_entity_id (entity_id),
  INDEX idx_created_at (created_at)
);
```

### 5.2 Estrutura Drizzle ORM

```typescript
// packages/mastra-engine/src/db/schema-crm.ts

import { sqliteTable, text, timestamp, integer, real } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

export const customers = sqliteTable('customers', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  name: text().notNull(),
  email: text(),
  phone: text(),
  address: text(),
  customerType: text().$type<'pf' | 'pj'>(),
  segment: text(),
  status: text().$type<'active' | 'inactive' | 'blocked'>().notNull(),
  customerScore: integer().default(0),
  ltvTotal: real().default(0),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
  metadata: text(),
}, (table) => ({
  idxEmail: index().on(table.email),
  idxStatus: index().on(table.status),
  idxSegment: index().on(table.segment),
  idxCreatedAt: index().on(table.createdAt),
}));

export const customerAccounts = sqliteTable('customer_accounts', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  customerId: text().notNull().references(() => customers.id),
  agentId: text().notNull(),
  accountName: text(),
  accountStatus: text().$type<'prospect' | 'customer' | 'inactive'>(),
  responsibleAgentId: text(),
  priority: text().$type<'high' | 'medium' | 'low'>(),
  ltvAccount: real().default(0),
  lastContactAt: timestamp(),
  nextContactRecommended: timestamp(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  idxCustomerId: index().on(table.customerId),
  idxAgentId: index().on(table.agentId),
  idxAccountStatus: index().on(table.accountStatus),
}));

export const customerContacts = sqliteTable('customer_contacts', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  customerId: text().notNull().references(() => customers.id),
  name: text().notNull(),
  jobTitle: text(),
  department: text(),
  email: text(),
  phone: text(),
  mobile: text(),
  decisionLevel: text().$type<'decision_maker' | 'influencer' | 'user'>(),
  lastInteractionAt: timestamp(),
  communicationPreference: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  idxCustomerId: index().on(table.customerId),
  idxEmail: index().on(table.email),
}));

export const opportunities = sqliteTable('opportunities', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  customerId: text().notNull().references(() => customers.id),
  accountId: text().references(() => customerAccounts.id),
  contactId: text().references(() => customerContacts.id),
  title: text().notNull(),
  description: text(),
  value: real(),
  currency: text().default('BRL'),
  stage: text().notNull(),
  probability: integer().default(50),
  closeDateExpected: timestamp(),
  closeDateActual: timestamp(),
  responsibleAgentId: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
  products: text(),
  metadata: text(),
}, (table) => ({
  idxCustomerId: index().on(table.customerId),
  idxStage: index().on(table.stage),
  idxResponsibleAgentId: index().on(table.responsibleAgentId),
  idxCloseDate: index().on(table.closeDateExpected),
}));

export const pipelineStages = sqliteTable('pipeline_stages', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  name: text().notNull(),
  sequence: integer().notNull(),
  probabilityDefault: integer().default(50),
  color: text(),
  description: text(),
  createdAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  uniqueSequence: unique().on(table.sequence),
  idxSequence: index().on(table.sequence),
}));

export const customerInteractions = sqliteTable('customer_interactions', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  customerId: text().notNull().references(() => customers.id),
  contactId: text().references(() => customerContacts.id),
  accountId: text().references(() => customerAccounts.id),
  opportunityId: text().references(() => opportunities.id),
  agentId: text().notNull(),
  interactionType: text().$type<'email' | 'call' | 'meeting' | 'transaction' | 'note'>().notNull(),
  channel: text(),
  subject: text(),
  content: text(),
  outcome: text().$type<'positive' | 'neutral' | 'negative'>(),
  durationMinutes: integer(),
  createdAt: timestamp().notNull().defaultNow(),
  interactionDate: timestamp().notNull(),
  nextAction: text(),
}, (table) => ({
  idxCustomerId: index().on(table.customerId),
  idxInteractionDate: index().on(table.interactionDate),
  idxType: index().on(table.interactionType),
  idxAgentId: index().on(table.agentId),
}));

export const opportunityStageHistory = sqliteTable('opportunity_stage_history', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  opportunityId: text().notNull().references(() => opportunities.id),
  stageFrom: text(),
  stageTo: text().notNull(),
  changedAt: timestamp().notNull().defaultNow(),
  changedByAgentId: text(),
  notes: text(),
}, (table) => ({
  idxOpportunityId: index().on(table.opportunityId),
  idxChangedAt: index().on(table.changedAt),
}));

export const customerTransactions = sqliteTable('customer_transactions', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  customerId: text().notNull().references(() => customers.id),
  accountId: text().references(() => customerAccounts.id),
  opportunityId: text().references(() => opportunities.id),
  erpOrderId: text().unique(),
  amount: real(),
  currency: text().default('BRL'),
  status: text().$type<'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'>(),
  orderDate: timestamp(),
  expectedDeliveryDate: timestamp(),
  actualDeliveryDate: timestamp(),
  createdAt: timestamp().notNull().defaultNow(),
  syncedFromErpAt: timestamp(),
}, (table) => ({
  idxCustomerId: index().on(table.customerId),
  idxErpOrderId: index().on(table.erpOrderId),
  idxStatus: index().on(table.status),
}));

export const crmAuditLog = sqliteTable('crm_audit_log', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  entityType: text().notNull(),
  entityId: text().notNull(),
  action: text().$type<'created' | 'updated' | 'deleted'>().notNull(),
  agentId: text(),
  changes: text(),
  createdAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  idxEntityType: index().on(table.entityType),
  idxEntityId: index().on(table.entityId),
  idxCreatedAt: index().on(table.createdAt),
}));

// Relations
export const customersRelations = relations(customers, ({ many }) => ({
  accounts: many(customerAccounts),
  contacts: many(customerContacts),
  opportunities: many(opportunities),
  interactions: many(customerInteractions),
  transactions: many(customerTransactions),
}));

export const customerAccountsRelations = relations(customerAccounts, ({ one, many }) => ({
  customer: one(customers, {
    fields: [customerAccounts.customerId],
    references: [customers.id],
  }),
  opportunities: many(opportunities),
  interactions: many(customerInteractions),
}));

export const customerContactsRelations = relations(customerContacts, ({ one, many }) => ({
  customer: one(customers, {
    fields: [customerContacts.customerId],
    references: [customers.id],
  }),
  interactions: many(customerInteractions),
}));

export const opportunitiesRelations = relations(opportunities, ({ one, many }) => ({
  customer: one(customers, {
    fields: [opportunities.customerId],
    references: [customers.id],
  }),
  account: one(customerAccounts, {
    fields: [opportunities.accountId],
    references: [customerAccounts.id],
  }),
  contact: one(customerContacts, {
    fields: [opportunities.contactId],
    references: [customerContacts.id],
  }),
  interactions: many(customerInteractions),
  stageHistory: many(opportunityStageHistory),
  transactions: many(customerTransactions),
}));
```

### 5.3 API de Gerenciamento de Clientes

```typescript
// packages/mastra-engine/src/crm/customer-service.ts

import { db } from '../db';
import { customers, customerAccounts, customerContacts } from '../db/schema-crm';
import { eq, and, like, or, inArray } from 'drizzle-orm';

export type CreateCustomerInput = {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  customerType?: 'pf' | 'pj';
  segment?: string;
  metadata?: Record<string, any>;
};

export type UpdateCustomerInput = Partial<CreateCustomerInput>;

export async function createCustomer(
  db: Database,
  input: CreateCustomerInput,
  agentId: string
): Promise<Customer> {
  const customerId = uuid();

  // Validar email único (opcional)
  if (input.email) {
    const existing = await db
      .select()
      .from(customers)
      .where(eq(customers.email, input.email));

    if (existing.length > 0) {
      throw new Error(`Customer with email ${input.email} already exists`);
    }
  }

  const customer = {
    id: customerId,
    name: input.name,
    email: input.email,
    phone: input.phone,
    address: input.address,
    customerType: input.customerType,
    segment: input.segment,
    status: 'active' as const,
    customerScore: 0,
    ltvTotal: 0,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(customers).values(customer);

  // Log to audit
  await logAudit(db, 'customer', customerId, 'created', agentId);

  return customer;
}

export async function getCustomer(
  db: Database,
  customerId: string
): Promise<Customer | null> {
  const result = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId));

  return result[0] || null;
}

export async function searchCustomers(
  db: Database,
  filter: {
    query?: string;
    status?: string;
    segment?: string;
    limit?: number;
    offset?: number;
  }
): Promise<Customer[]> {
  let query = db.select().from(customers);
  const conditions = [];

  if (filter.query) {
    conditions.push(
      or(
        like(customers.name, `%${filter.query}%`),
        like(customers.email, `%${filter.query}%`),
        like(customers.phone, `%${filter.query}%`)
      )
    );
  }

  if (filter.status) {
    conditions.push(eq(customers.status, filter.status));
  }

  if (filter.segment) {
    conditions.push(eq(customers.segment, filter.segment));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  if (filter.limit) {
    query = query.limit(filter.limit);
  }

  if (filter.offset) {
    query = query.offset(filter.offset);
  }

  return query;
}

export async function updateCustomer(
  db: Database,
  customerId: string,
  input: UpdateCustomerInput,
  agentId: string
): Promise<Customer> {
  const updates: any = {
    updatedAt: new Date(),
  };

  if (input.name) updates.name = input.name;
  if (input.email) updates.email = input.email;
  if (input.phone) updates.phone = input.phone;
  if (input.address) updates.address = input.address;
  if (input.customerType) updates.customerType = input.customerType;
  if (input.segment) updates.segment = input.segment;
  if (input.metadata) updates.metadata = JSON.stringify(input.metadata);

  await db
    .update(customers)
    .set(updates)
    .where(eq(customers.id, customerId));

  await logAudit(db, 'customer', customerId, 'updated', agentId, updates);

  return getCustomer(db, customerId);
}

async function logAudit(
  db: Database,
  entityType: string,
  entityId: string,
  action: 'created' | 'updated' | 'deleted',
  agentId: string,
  changes?: any
) {
  await db.insert(crmAuditLog).values({
    id: uuid(),
    entityType,
    entityId,
    action,
    agentId,
    changes: changes ? JSON.stringify(changes) : null,
    createdAt: new Date(),
  });
}
```

### 5.4 API de Gerenciamento de Oportunidades

```typescript
// packages/mastra-engine/src/crm/opportunity-service.ts

export type CreateOpportunityInput = {
  customerId: string;
  accountId?: string;
  contactId?: string;
  title: string;
  description?: string;
  value?: number;
  currency?: string;
  stage: string;
  probability?: number;
  closeDateExpected?: Date;
  products?: string[];
  metadata?: Record<string, any>;
};

export async function createOpportunity(
  db: Database,
  input: CreateOpportunityInput,
  agentId: string
): Promise<Opportunity> {
  const opportunityId = uuid();
  const defaultStage = input.stage || 'prospecting';
  const probabilityDefault = await getStageDefaultProbability(db, defaultStage);

  const opportunity = {
    id: opportunityId,
    customerId: input.customerId,
    accountId: input.accountId,
    contactId: input.contactId,
    title: input.title,
    description: input.description,
    value: input.value,
    currency: input.currency || 'BRL',
    stage: defaultStage,
    probability: input.probability ?? probabilityDefault,
    closeDateExpected: input.closeDateExpected,
    closeDateActual: null,
    responsibleAgentId: agentId,
    products: input.products ? JSON.stringify(input.products) : null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(opportunities).values(opportunity);

  // Log stage change to history
  await db.insert(opportunityStageHistory).values({
    id: uuid(),
    opportunityId,
    stageFrom: null,
    stageTo: defaultStage,
    changedAt: new Date(),
    changedByAgentId: agentId,
    notes: 'Oportunidade criada',
  });

  await logAudit(db, 'opportunity', opportunityId, 'created', agentId);

  return opportunity;
}

export async function moveOpportunityStage(
  db: Database,
  opportunityId: string,
  newStage: string,
  agentId: string,
  notes?: string
): Promise<void> {
  const opportunity = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, opportunityId));

  if (!opportunity.length) {
    throw new Error('Opportunity not found');
  }

  const oldStage = opportunity[0].stage;
  const probabilityDefault = await getStageDefaultProbability(db, newStage);

  await db
    .update(opportunities)
    .set({
      stage: newStage,
      probability: probabilityDefault,
      updatedAt: new Date(),
    })
    .where(eq(opportunities.id, opportunityId));

  // Log to stage history
  await db.insert(opportunityStageHistory).values({
    id: uuid(),
    opportunityId,
    stageFrom: oldStage,
    stageTo: newStage,
    changedAt: new Date(),
    changedByAgentId: agentId,
    notes,
  });

  // If moved to closed-won or closed-lost, set close date
  if (['closed-won', 'closed-lost'].includes(newStage)) {
    await db
      .update(opportunities)
      .set({ closeDateActual: new Date() })
      .where(eq(opportunities.id, opportunityId));
  }

  await logAudit(db, 'opportunity', opportunityId, 'updated', agentId, {
    stage: `${oldStage} → ${newStage}`,
  });
}

async function getStageDefaultProbability(db: Database, stageName: string): Promise<number> {
  const stage = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.name, stageName));

  return stage[0]?.probabilityDefault ?? 50;
}
```

### 5.5 Sincronização com ERP

```typescript
// packages/mastra-engine/src/crm/erp-sync.ts

export async function syncTransactionFromErp(
  db: Database,
  erpData: {
    orderId: string;
    customerId: string;
    amount: number;
    currency: string;
    status: string;
    orderDate: Date;
    expectedDeliveryDate?: Date;
  }
): Promise<void> {
  // Verificar se customer existe no CRM
  const customer = await getCustomer(db, erpData.customerId);
  if (!customer) {
    // Criar customer a partir do ERP (nome genérico)
    await createCustomer(db, {
      name: `Customer ${erpData.customerId}`,
    }, 'erp-sync');
  }

  // Buscar oportunidade aberta para este cliente
  const openOpportunities = await db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.customerId, erpData.customerId),
        inArray(opportunities.stage, ['prospecting', 'qualification', 'proposal', 'negotiation'])
      )
    );

  const opportunityId = openOpportunities[0]?.id;

  // Criar ou atualizar transação
  const existingTransaction = await db
    .select()
    .from(customerTransactions)
    .where(eq(customerTransactions.erpOrderId, erpData.orderId));

  if (existingTransaction.length > 0) {
    // Update existing
    await db
      .update(customerTransactions)
      .set({
        status: erpData.status,
        syncedFromErpAt: new Date(),
      })
      .where(eq(customerTransactions.erpOrderId, erpData.orderId));
  } else {
    // Create new
    await db.insert(customerTransactions).values({
      id: uuid(),
      customerId: erpData.customerId,
      opportunityId,
      erpOrderId: erpData.orderId,
      amount: erpData.amount,
      currency: erpData.currency,
      status: erpData.status,
      orderDate: erpData.orderDate,
      expectedDeliveryDate: erpData.expectedDeliveryDate,
      createdAt: new Date(),
      syncedFromErpAt: new Date(),
    });
  }

  // Atualizar LTV do cliente
  const totalTransactions = await db
    .select({ total: sql`SUM(amount)`.as('total') })
    .from(customerTransactions)
    .where(eq(customerTransactions.customerId, erpData.customerId));

  const newLtv = totalTransactions[0]?.total || 0;

  await db
    .update(customers)
    .set({ ltvTotal: newLtv })
    .where(eq(customers.id, erpData.customerId));

  // Se transação é confirmada e opportunity aberta, atualizar opportunity value
  if (erpData.status === 'confirmed' && opportunityId) {
    await db
      .update(opportunities)
      .set({ value: erpData.amount })
      .where(eq(opportunities.id, opportunityId));
  }
}

export async function syncCustomerToErp(
  db: Database,
  customerId: string,
  erpClient: any // Tipo do cliente ERP
): Promise<void> {
  const customer = await getCustomer(db, customerId);
  if (!customer) return;

  // Enviar para ERP
  await erpClient.createOrUpdateCustomer({
    externalId: customerId,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    metadata: customer.metadata,
  });
}
```

---

## 6. Plano de Implementação

### Fase 1: Schema e Infraestrutura (Sprint 1-2)
- [ ] Definir schema completo com Drizzle ORM
- [ ] Criar migrations para todas as tabelas CRM
- [ ] Implementar índices para performance
- [ ] Setup de testes para models
- [ ] Criar fixtures de dados de teste

### Fase 2: API de Clientes e Oportunidades (Sprint 3-4)
- [ ] Implementar `createCustomer()`, `updateCustomer()`, `getCustomer()`
- [ ] Implementar busca/filtro de clientes
- [ ] Implementar CRUD de oportunidades
- [ ] Implementar `moveOpportunityStage()` com histórico
- [ ] Implementar CRUD de contatos
- [ ] Testes unitários para cada função

### Fase 3: Interações e Auditoria (Sprint 5)
- [ ] Implementar captura automática de interações (email, Discord, Slack)
- [ ] Implementar logging de auditoria (audit trail)
- [ ] Implementar timeline de cliente
- [ ] Integração com Communication Module

### Fase 4: Integração ERP (Sprint 6-7)
- [ ] Implementar sincronização de transações (ERP → CRM)
- [ ] Implementar sincronização de clientes (CRM → ERP)
- [ ] Implementar webhook para receber updates do ERP
- [ ] Testes de sincronização bidirecional

### Fase 5: Análise e Relatórios (Sprint 8)
- [ ] Implementar cálculo de métricas (pipeline value, conversão, etc)
- [ ] Implementar filtros de análise por período/agente/segmento
- [ ] Implementar forecast de receita
- [ ] API de relatórios

### Fase 6: Validação e Rollout (Sprint 9)
- [ ] Testes end-to-end (múltiplos clientes/oportunidades)
- [ ] Performance testing (100k+ clientes)
- [ ] Documentação de API
- [ ] Documentação operacional

---

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|--------|-----------|
| Dados desincronizados entre CRM e ERP | Média | Alto | Implementar eventual consistency check e reconciliation job |
| Performance de queries com muitos registros | Média | Médio | Benchmark com 100k+ records, índices apropriados |
| Auditoria incompleta de mudanças | Baixa | Médio | Implementar audit trigger em todas as operações críticas |
| Sincronização ERP é gargalo | Baixa | Médio | Implementar async processing com queue (Bull, RabbitMQ) |
| Relacionamentos complexos causam queries N+1 | Média | Médio | Usar Drizzle relations, eager loading onde necessário |
| Dados de contato/email vazam em logs | Média | CRÍTICO | Implementar data masking em logs, PII filtering |
| Teste com dados reais do ERP é difícil | Média | Médio | Criar mock ERP client, fixtures de dados realistas |

---

## 8. Métricas de Sucesso

### Técnicas
- [ ] Schema implementado com 8+ tabelas
- [ ] 100% de operações CRUD funcionando
- [ ] Busca de clientes < 100ms
- [ ] Carga de pipeline < 200ms (até 10k oportunidades)
- [ ] Sincronização ERP < 5s por batch

### Funcionais
- [ ] Múltiplos clientes e contas gerenciáveis
- [ ] Pipeline de oportunidades visualizável
- [ ] Histórico de interações capturado automaticamente
- [ ] Transações do ERP sincronizadas
- [ ] Relatórios de pipeline básicos funcionando

### de Negócio
- [ ] Melhorar rastreamento de relacionamento com cliente
- [ ] Aumentar visibilidade de pipeline de vendas
- [ ] Reduzir tempo de busca de informações de cliente
- [ ] Integração seamless com ERP

---

## 9. Dependências Externas

### Internas
- Drizzle ORM (já em uso)
- Communication Module (para captura de interações)
- ERP Module (para sincronização)
- crypto (Node.js native)

### Externas
- LibSQL (SQLite) ✅ Suportado por Drizzle
- Node.js 18+ ✅

### Compatibilidade
- Não quebra API existente ✅
- Não quebra agent-facing tools ✅

---

## 10. Estimativas

### Tamanho da Feature
**Esforço total:** ~120-150 horas (6-7 sprints)

### Breakdown por Fase
1. **Fase 1 (Schema):** 20h
2. **Fase 2 (CRUD):** 35h
3. **Fase 3 (Interações):** 25h
4. **Fase 4 (ERP Sync):** 30h
5. **Fase 5 (Análise):** 20h
6. **Fase 6 (Validation):** 15h

### Story Points (Fibonacci)
- [ ] Epic PRD-21: 55 story points (6-7 sprints, 1 dev full-time ou 2 devs part-time)

---

## 11. Documentação Necessária

### Para Desenvolvedores
1. `docs/implementation/crm-schema.md` — Design do banco de dados
2. `docs/implementation/crm-api.md` — API reference completa
3. `docs/implementation/crm-erp-integration.md` — Como sincronizar com ERP
4. `docs/implementation/crm-interaction-capture.md` — Como capturar interações automático

### Para Operadores
1. `docs/operations/crm-setup.md` — Como configurar o CRM
2. `docs/operations/crm-erp-sync.md` — Como configurar sincronização com ERP
3. `docs/operations/crm-troubleshooting.md` — Debugging de problemas

### Para Usuários/Agentes
1. `docs/usage/crm-agent-tools.md` — Tools disponíveis para agentes
2. `docs/usage/crm-customer-management.md` — Como gerenciar clientes
3. `docs/usage/crm-opportunity-pipeline.md` — Como trabalhar com oportunidades

---

## 12. Critérios de Aceitação

- [ ] Schema CRM completo definido e migrations criadas
- [ ] CRUD de clientes, contas e contatos implementado e testado
- [ ] CRUD de oportunidades com rastreamento de estágio
- [ ] Captura automática de interações do Communication Module
- [ ] Histórico de auditoria completo (audit trail)
- [ ] Sincronização de transações do ERP funcionando
- [ ] Cálculo de métricas básicas (pipeline value, conversão)
- [ ] API de relatórios implementada
- [ ] Performance testing passou (< 100ms busca, < 200ms pipeline)
- [ ] Documentação completa
- [ ] Zero exposição de PII em logs
- [ ] Testes E2E com múltiplos clientes e oportunidades

---

## 13. Próximos Passos Recomendados

### Imediato (Antes de iniciar Phase 1)
1. **Revisar com time:** Apresentar PRD para architectural review
2. **Decidir model de ERP:** Qual sistema ERP integrar? API disponível?
3. **Definir pipeline stages:** Quais serão os estágios padrão?
4. **Setup de testes:** Ambiente de teste com dados realistas
5. **Planejar migração:** Como migrar dados de CRM legado (se houver)?

### Após Phase 2
1. **Dashboard CRM:** UI para visualizar clientes/oportunidades
2. **Campos customizáveis:** Permitir adicionar campos por empresa
3. **Relatórios avançados:** Forecasting com ML

### Após Phase 4
1. **Automação de regras:** Criar oportunidades automaticamente baseado em transações
2. **Notificações:** Alertar sobre oportunidades em risco
3. **Integration com Salesforce:** Para clientes que usam Salesforce

### Longo Prazo
1. **Mobile app:** Acesso ao CRM via mobile
2. **Integração de telefonia:** Capturar ligações automaticamente
3. **Análise de sentimento:** Analisar emails/mensagens para sentimento de cliente
4. **Territory management:** Atribuição automática de clientes a agentes
5. **Revenue intelligence:** Previsão de receita com ML

---

**Preparado por:** Análise Detalhada (Agent)
**Data:** 2026-03-15
**Próxima revisão:** Após Phase 1 (discussão técnica com time)

---

## Apêndice A: Exemplo de Uso End-to-End

### Cenário: Novo cliente e oportunidade

```typescript
// 1. Criar novo cliente
const customer = await createCustomer(db, {
  name: 'Acme Corporation',
  email: 'contact@acme.com',
  phone: '+55 11 98765-4321',
  customerType: 'pj',
  segment: 'Technology',
}, agentId);

// 2. Criar conta associada
const account = await createAccount(db, {
  customerId: customer.id,
  agentId,
  accountName: 'Acme - São Paulo',
  accountStatus: 'prospect',
  priority: 'high',
});

// 3. Adicionar contatos
const contact = await createContact(db, {
  customerId: customer.id,
  name: 'John Smith',
  jobTitle: 'CTO',
  email: 'john@acme.com',
  decisionLevel: 'decision_maker',
});

// 4. Criar oportunidade
const opportunity = await createOpportunity(db, {
  customerId: customer.id,
  accountId: account.id,
  contactId: contact.id,
  title: 'Software License - 100 seats',
  description: 'Yearly license renewal',
  value: 50000,
  currency: 'BRL',
  stage: 'prospecting',
}, agentId);

// 5. Enviar email via agent tool
await sendMessage({
  provider: 'email-1',
  to: contact.email,
  subject: `Proposta - ${opportunity.title}`,
  body: 'Prezado John, segue nossa proposta...',
});

// 6. Captura automática: email é registrado como interação
// (dispara via webhook da Communication Module)

// 7. Após discussão: mover para próximo estágio
await moveOpportunityStage(
  db,
  opportunity.id,
  'qualification',
  agentId,
  'Cliente marcou reunião para discutir detalhes'
);

// 8. ERP cria pedido: recebemos via webhook
await syncTransactionFromErp(db, {
  orderId: 'ORD-2024-001',
  customerId: customer.id,
  amount: 50000,
  currency: 'BRL',
  status: 'confirmed',
  orderDate: new Date(),
});

// 9. Mover oportunidade para fechada
await moveOpportunityStage(db, opportunity.id, 'closed-won', agentId);

// 10. Obter relatório do pipeline
const metrics = await getPipelineMetrics(db, {
  groupBy: 'stage',
  fromDate: startOfMonth(new Date()),
  toDate: endOfMonth(new Date()),
});

console.log(metrics);
// Output:
// {
//   prospecting: { count: 5, value: 100000, avgProbability: 30 },
//   qualification: { count: 3, value: 150000, avgProbability: 50 },
//   proposal: { count: 2, value: 80000, avgProbability: 70 },
//   closed-won: { count: 1, value: 50000, avgProbability: 100 },
//   totalValue: 380000,
//   forecast: 285000, // probability-weighted
// }
```

---

**FIM DO DOCUMENTO**

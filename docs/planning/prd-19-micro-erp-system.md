# PRD 19: Micro-ERP System

**Status:** Draft - Detailed Analysis and Planning
**Data:** 2026-03-15
**Versão:** 1.0
**Responsável:** Finance & Data Architecture Team

---

## Resumo Executivo

### Objetivo Principal
Implementar um sistema de rastreamento financeiro integrado que fornece visibilidade completa sobre despesas, receitas, folha de pagamento e fluxo de caixa, com capacidades de previsão financeira e controle de fluxo baseado em dados financeiros, habilitando agentes e stakeholders a acessar seus próprios dados financeiros em tempo real.

### Proposta de Valor
1. **Visibilidade Financeira:** Dashboard centralizado com rastreamento completo de receitas, despesas e folha de pagamento
2. **Controle de Fluxo:** Automação de decisões operacionais baseada em limites financeiros e previsões
3. **Autonomia de Agentes:** Agentes acessam seus próprios dados financeiros (compensação, performance metrics)
4. **Previsão e Planejamento:** Capacidade de fazer projeções financeiras futuras para planning
5. **Conformidade:** Auditoria completa e rastreamento de todas as transações financeiras

### Escopo da Feature
- Implementar módulo de rastreamento de despesas com categorização e tags
- Implementar módulo de rastreamento de receitas (por fonte/projeto)
- Implementar gestão de folha de pagamento (custos de agentes, compensações)
- Implementar engine de previsão financeira com modelos simples e avançados
- Implementar controle de fluxo baseado em limites financeiros (spending limits, aprovações)
- Fornecer API de acesso a agentes para seus próprios dados financeiros
- Criar dashboard de visualização financeira (admin/agent perspectives)

### Não está no Escopo
- Integração com softwares de contabilidade externas (QuickBooks, Xero) - Phase 2
- Suporte a múltiplas moedas/câmbio - Phase 2
- Relatórios de impostos/compliance avançado - Fase futura
- Integração com processadores de pagamento (Stripe, PayPal) - Phase 2
- Automação de geração de faturas - Phase 2
- Análise preditiva com Machine Learning avançado - Phase 2

---

## 2. Contexto Técnico Atual

### Arquitetura Existente

#### Situação Atual do Sistema
```
Runtime (createAgent/createForgeAgent)
  ├─ Agent State Management
  │  ├─ Task execution tracking
  │  ├─ Performance metrics
  │  └─ NO financial tracking
  │
  ├─ Communication Module
  │  ├─ Message routing
  │  └─ NO financial context
  │
  └─ Workflow Engine
     ├─ Tool execution
     └─ NO spending controls
```

#### Problema Identificado
1. **Sem Rastreamento Financeiro:** Nenhuma visibilidade sobre custos operacionais
2. **Sem Controle de Gastos:** Impossível implementar limites de spending ou aprovações
3. **Sem Visibilidade de Folha de Pagamento:** Custos de agentes não rastreados
4. **Sem Previsão:** Impossível fazer planning financeiro futuro
5. **Sem Autonomia de Agentes:** Agentes não podem acessar seus próprios dados financeiros
6. **Sem Auditoria:** Sem histórico de todas as transações financeiras

### Stack Técnico Atual
- **Runtime:** Node.js + TypeScript
- **Database:** LibSQL (SQLite-compatible)
- **ORM:** Drizzle (já implementado via PRD-02)
- **State Management:** In-memory + Drizzle persistence

### Dependências Existentes
- `@libsql/client` — Database client
- `drizzle-orm` — ORM (via PRD-02)
- `zod` — Schema validation
- Node.js built-in: `crypto`, `timers`

---

## 3. Requisitos Funcionais

### 3.1 Rastreamento de Despesas

**RF-1: Registro de despesas**
- Criar transaction de tipo EXPENSE com:
  - Identificação: transaction_id, agent_id, category_id
  - Valores: amount, currency, timestamp
  - Classificação: category, subcategory, tags, project_id
  - Descrição: description, reference (invoice, receipt ID)
  - Status: pending, approved, rejected, reconciled
- Suportar despesas recorrentes (monthly, weekly, custom schedules)
- Permitir importação em lote de despesas
- Validar limites de categoria (máximo mensal/anual)

**RF-2: Categorização de despesas**
- Categorias pré-definidas:
  - Infrastructure (servers, databases, APIs)
  - Personnel (salários, benefícios, training)
  - Tools & Software (licenses, subscriptions)
  - Marketing & Customer Acquisition
  - Operations (utilities, office, travel)
  - Research & Development
  - Contingency/Other
- Permitir sub-categorias customizadas por agente/projeto
- Permitir tags múltiplas por transação para análise cruzada

**RF-3: Rastreamento por projeto e agente**
- Cada despesa pode ser alocada a:
  - Projeto específico (para análise de ROI)
  - Agente específico (para tracking de custo por agente)
  - Centro de custo (department, team)
- Permitir split de uma despesa entre múltiplos projetos/agentes

### 3.2 Rastreamento de Receitas

**RF-4: Registro de receitas**
- Criar transaction de tipo REVENUE com:
  - Fonte: customer_id, project_id, service_type
  - Valores: amount, currency, timestamp
  - Classificação: revenue_stream, tags
  - Status: invoiced, received, pending
- Suportar receitas recorrentes (subscriptions, monthly contracts)
- Rastrear diferença entre invoiced vs. actually received (accrual vs. cash basis)

**RF-5: Rastreamento por fonte de receita**
- Classificar receitas por:
  - Tipo de serviço (consulting, development, support, automation)
  - Cliente/projeto
  - Contrato (one-time, recurring)
- Permitir análise de receita por fonte para identificar produtos mais rentáveis

**RF-6: Recebimentos e reconciliação**
- Rastrear quando receita é recebida (não apenas invoiced)
- Permitir marcação de pagamentos recebidos
- Identificar contas a receber antigas (aged receivables)
- Suportar pagamentos parciais

### 3.3 Gerenciamento de Folha de Pagamento

**RF-7: Rastreamento de custos de agentes**
- Para cada agente, registrar:
  - Tipo: full-time cost, per-task cost, performance-based
  - Base cost: salário/taxa fixa por período
  - Benefícios/overhead associados
  - Período de vigência (start_date, end_date)
- Histórico de mudanças salariais para auditoria
- Suportar custos variáveis baseados em performance

**RF-8: Cálculo de compensação**
- Calcular compensação devida a agentes baseado em:
  - Horas trabalhadas / tarefas completadas
  - Performance metrics (quality, speed, customer satisfaction)
  - Bônus/incentivos especiais
  - Deduções (se aplicável)
- Gerar relatório de compensação por período
- Rastrear compensações pagas vs. accrued

**RF-9: Análise de custo-benefício por agente**
- Comparar custo total do agente vs. receita gerada
- Calcular ROI: revenue attribution / agent cost
- Permitir análise de produtividade financeira
- Identificar agentes top performers vs. low performers

### 3.4 Previsão Financeira

**RF-10: Modelos simples de previsão**
- Previsão linear baseada em histórico:
  - Moving average (3, 6, 12 meses)
  - Trend analysis (crescimento/decrescimento)
  - Seasonal analysis (padrões sazonais)
- Forecast por 1, 3, 6, 12 meses
- Confidence intervals (low, medium, high confidence)

**RF-11: Previsão por categoria**
- Previsão separada para cada categoria de despesa
- Previsão para cada fonte de receita
- Agregação de previsões para total company cash flow

**RF-12: Cenários e análise de sensibilidade**
- Criar cenários "what-if":
  - Pessimistic: -20% receita, +15% despesas
  - Base case: trend atual
  - Optimistic: +20% receita, -10% despesas
- Permitir ajuste manual de parâmetros
- Mostrar impacto na runway (meses de cash left)

### 3.5 Controle de Fluxo Baseado em Dados Financeiros

**RF-13: Limites de spending**
- Definir limites por:
  - Categoria (máx por mês)
  - Agente (máx por período)
  - Projeto (máx por projeto)
  - Total company (máx mensal)
- Configuração por agent, por projeto owner, ou admin global
- Limites soft (warning) vs. hard (block)

**RF-14: Aprovações baseadas em regras**
- Transações acima de limites requerem aprovação:
  - Aprovador por categoria
  - Aprovador por projeto
  - Escalação a C-level se acima de X valor
- Workflow de aprovação com notificações
- Auditoria de quem aprovou/rejeitou e por quê

**RF-15: Inteligência de bloco de transações**
- Bloquear automaticamente:
  - Gastos se cash runway < 3 meses
  - Gastos em categoria se já 90% do budget foi gasto
  - Qualquer gasto acima de limite de emergência
- Notificar agentes/admins quando bloqueados
- Permitir override com justificativa

### 3.6 Acesso de Agentes aos Próprios Dados

**RF-16: API de dados financeiros para agentes**
- Fornecer tools que agentes podem usar:
  - `getMyCompensation()` — Quanto foi ganho/ganha próximo período
  - `getMyPerformanceMetrics()` — Métricas de performance financeira
  - `getMyProjectFinancials(projectId)` — Dados financeiros de projetos que trabalho
  - `getSpendingStatus(categoryId)` — Status de gasto em categorias que controlo
- Dados são filtrados: agente só vê seus próprios dados (ou dados de projetos que gerencia)

**RF-17: Dashboard de agente**
- Interface web/API que agentes podem acessar para ver:
  - Compensação histórica e projetada
  - Performance vs. targets
  - Projetos e sua profitabilidade
  - Gastos que autorizo/que dependem de mim

**RF-18: Notificações financeiras**
- Alertar agentes quando:
  - Compensação está pronta para pagamento
  - Performance bônus foi ganho
  - Projeto financeiro mudou significativamente
  - Spending limit foi atingido em categorias que controlam

---

## 4. Requisitos Não-Funcionais

### 4.1 Performance
- **RNF-1:** Lookup de dados financeiros < 100ms (com cache)
- **RNF-2:** Dashboard carrega em < 2s mesmo com 10 anos de histórico
- **RNF-3:** Previsão financeira calcula em < 500ms
- **RNF-4:** Agregações (sum, avg) com índices para queries rápidas

### 4.2 Segurança
- **RNF-5:** Dados financeiros sensíveis criptografados em repouso (se config avançada)
- **RNF-6:** Acesso controlado: agentes só veem dados que têm permissão
- **RNF-7:** Auditoria completa: quem alterou, quando, o quê, de onde
- **RNF-8:** Compliance: suportar GDPR, CCPA (direito a dados pessoais)

### 4.3 Escalabilidade
- **RNF-9:** Suportar 1000+ transações/dia sem degradação
- **RNF-10:** Suportar análise de 10+ anos de histórico financeiro
- **RNF-11:** Agregações em tempo real mesmo com milhões de transações

### 4.4 Confiabilidade
- **RNF-12:** Zero perda de dados financeiros (transações idempotentes)
- **RNF-13:** Backup automático de dados financeiros (diário)
- **RNF-14:** Recuperação de falhas sem inconsistências (ACID compliance)

### 4.5 Auditoria
- **RNF-15:** Cada transação é imutável após registro (append-only log)
- **RNF-16:** Rastrear origem de cada transação (API call, import, manual entry)
- **RNF-17:** Timestamp em UTC, timezone-aware para análise

---

## 5. Arquitetura da Solução

### 5.1 Novas Tabelas de Banco de Dados

```sql
-- Tabela base de transações financeiras
CREATE TABLE financial_transactions (
  id TEXT PRIMARY KEY,                    -- uuid
  type TEXT NOT NULL,                     -- 'EXPENSE', 'REVENUE', 'ADJUSTMENT'

  -- Valores e data
  amount DECIMAL(15,2) NOT NULL,
  currency TEXT NOT NULL,                 -- 'USD', 'BRL', etc
  transaction_date TIMESTAMP NOT NULL,    -- Quando ocorreu
  recorded_date TIMESTAMP NOT NULL,       -- Quando foi registrado

  -- Classificação
  category_id TEXT NOT NULL,              -- FK to financial_categories
  subcategory_id TEXT,                    -- FK to financial_categories
  description TEXT,
  reference_id TEXT,                      -- Invoice, receipt, contract ID
  tags TEXT,                              -- JSON array of tags

  -- Alocação
  agent_id TEXT,                          -- Agente responsável/afetado
  project_id TEXT,                        -- Projeto associado
  cost_center_id TEXT,                    -- Centro de custo

  -- Status e rastreamento
  status TEXT NOT NULL,                   -- 'pending', 'approved', 'rejected', 'reconciled'
  approved_by TEXT,                       -- User/admin que aprovou
  approved_at TIMESTAMP,

  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,                   -- RRULE para recurring expenses

  created_by TEXT NOT NULL,               -- Who created
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_type (type),
  INDEX idx_agent_id (agent_id),
  INDEX idx_project_id (project_id),
  INDEX idx_category_id (category_id),
  INDEX idx_transaction_date (transaction_date),
  INDEX idx_status (status),
  UNIQUE (reference_id)
);

-- Categorias de transações
CREATE TABLE financial_categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT,                         -- NULL for top-level, FK for subcategory
  name TEXT NOT NULL,
  type TEXT NOT NULL,                     -- 'EXPENSE', 'REVENUE'
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  budget_limit DECIMAL(15,2),             -- Optional monthly budget

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_type (type),
  UNIQUE (parent_id, name)
);

-- Custos de agentes (folha de pagamento)
CREATE TABLE agent_costs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,

  -- Período de vigência
  effective_from DATE NOT NULL,
  effective_until DATE,

  -- Componentes de custo
  base_cost_per_period DECIMAL(15,2) NOT NULL,
  period_type TEXT NOT NULL,              -- 'monthly', 'weekly', 'per_task'

  cost_type TEXT NOT NULL,                -- 'salary', 'hourly_rate', 'per_task_rate'
  additional_benefits_pct DECIMAL(5,2),   -- Overhead/benefits percentage

  performance_bonus_formula TEXT,         -- JSON describing bonus calculation

  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_agent_id (agent_id),
  INDEX idx_effective_from (effective_from)
);

-- Compensação calculada para agentes
CREATE TABLE agent_compensation (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,

  -- Período
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Cálculos
  base_amount DECIMAL(15,2) NOT NULL,
  performance_bonus DECIMAL(15,2) DEFAULT 0,
  deductions DECIMAL(15,2) DEFAULT 0,
  total_amount DECIMAL(15,2) NOT NULL,

  -- Status
  status TEXT NOT NULL,                   -- 'accrued', 'approved', 'paid'
  paid_on TIMESTAMP,

  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_agent_id (agent_id),
  INDEX idx_period_start (period_start),
  INDEX idx_status (status)
);

-- Previsões financeiras
CREATE TABLE financial_forecasts (
  id TEXT PRIMARY KEY,

  forecast_type TEXT NOT NULL,            -- 'expense', 'revenue', 'aggregate'
  category_id TEXT,                       -- NULL para aggregate, FK para categoria específica

  -- Período de previsão
  forecast_start_date DATE NOT NULL,
  forecast_end_date DATE NOT NULL,

  -- Resultado da previsão
  confidence_level TEXT NOT NULL,         -- 'low', 'medium', 'high'
  forecast_method TEXT NOT NULL,          -- 'moving_average', 'trend', 'seasonal', 'scenario'

  -- Valores
  expected_amount DECIMAL(15,2) NOT NULL,
  confidence_interval_low DECIMAL(15,2),
  confidence_interval_high DECIMAL(15,2),

  -- Metadata
  calculated_at TIMESTAMP NOT NULL,
  based_on_months INTEGER,               -- Quantos meses de histórico foram usados

  INDEX idx_forecast_type (forecast_type),
  INDEX idx_category_id (category_id),
  INDEX idx_forecast_start_date (forecast_start_date)
);

-- Cenários de previsão (what-if analysis)
CREATE TABLE financial_scenarios (
  id TEXT PRIMARY KEY,

  name TEXT NOT NULL,                     -- 'pessimistic', 'base', 'optimistic'
  description TEXT,
  scenario_type TEXT NOT NULL,            -- 'predefined', 'custom'

  -- Parâmetros
  revenue_multiplier DECIMAL(5,2),        -- 0.8 = -20%, 1.2 = +20%
  expense_multiplier DECIMAL(5,2),
  custom_adjustments TEXT,                -- JSON: { "category_id": amount, ... }

  -- Resultado
  projected_runway_months INTEGER,        -- Meses de cash left
  projected_end_balance DECIMAL(15,2),

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Regras de spending e aprovação
CREATE TABLE spending_rules (
  id TEXT PRIMARY KEY,

  -- Aplicabilidade
  scope TEXT NOT NULL,                    -- 'global', 'agent', 'project', 'category'
  scope_id TEXT,                          -- agent_id, project_id, category_id ou NULL

  -- Limite
  limit_type TEXT NOT NULL,               -- 'hard', 'soft'
  amount_limit DECIMAL(15,2) NOT NULL,
  period TEXT NOT NULL,                   -- 'daily', 'weekly', 'monthly', 'yearly'

  -- Aprovação
  requires_approval BOOLEAN DEFAULT FALSE,
  approval_chain TEXT,                    -- JSON: ["user_1", "user_2"] in order

  -- Ativação
  is_active BOOLEAN DEFAULT TRUE,
  start_date TIMESTAMP,
  end_date TIMESTAMP,

  created_by TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_scope (scope),
  INDEX idx_scope_id (scope_id),
  INDEX idx_is_active (is_active)
);

-- Auditoria de transações financeiras
CREATE TABLE financial_audit_log (
  id TEXT PRIMARY KEY,

  transaction_id TEXT,                    -- FK to financial_transactions
  action TEXT NOT NULL,                   -- 'created', 'updated', 'approved', 'rejected'

  changed_fields TEXT,                    -- JSON: { "status": ["pending", "approved"] }

  performed_by TEXT NOT NULL,
  reason TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_transaction_id (transaction_id),
  INDEX idx_performed_by (performed_by),
  INDEX idx_created_at (created_at)
);
```

### 5.2 Estrutura Drizzle ORM

```typescript
// packages/mastra-engine/src/db/schema/financial.ts

import { sqliteTable, text, timestamp, integer, real, decimal } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

export const financialTransactions = sqliteTable('financial_transactions', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  type: text().$type<'EXPENSE' | 'REVENUE' | 'ADJUSTMENT'>().notNull(),

  amount: text().notNull(), // Store as string to preserve precision
  currency: text().notNull().default('USD'),
  transactionDate: timestamp().notNull(),
  recordedDate: timestamp().notNull().defaultNow(),

  categoryId: text().notNull().references(() => financialCategories.id),
  subcategoryId: text().references(() => financialCategories.id),
  description: text(),
  referenceId: text(),
  tags: text(), // JSON array

  agentId: text(),
  projectId: text(),
  costCenterId: text(),

  status: text().$type<'pending' | 'approved' | 'rejected' | 'reconciled'>().notNull().default('pending'),
  approvedBy: text(),
  approvedAt: timestamp(),

  isRecurring: integer({ mode: 'boolean' }).default(false),
  recurrenceRule: text(),

  createdBy: text().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  idxType: index().on(table.type),
  idxAgentId: index().on(table.agentId),
  idxProjectId: index().on(table.projectId),
  idxCategoryId: index().on(table.categoryId),
  idxTransactionDate: index().on(table.transactionDate),
  idxStatus: index().on(table.status),
  uniqueReference: unique().on(table.referenceId),
}));

export const financialCategories = sqliteTable('financial_categories', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  parentId: text().references(() => financialCategories.id),

  name: text().notNull(),
  type: text().$type<'EXPENSE' | 'REVENUE'>().notNull(),
  description: text(),

  isActive: integer({ mode: 'boolean' }).default(true),
  budgetLimit: text(), // Decimal stored as string

  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  idxType: index().on(table.type),
  uniqueName: unique().on(table.parentId, table.name),
}));

export const agentCosts = sqliteTable('agent_costs', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  agentId: text().notNull(),

  effectiveFrom: text().notNull(), // DATE
  effectiveUntil: text(), // DATE

  baseCostPerPeriod: text().notNull(),
  periodType: text().$type<'monthly' | 'weekly' | 'per_task'>().notNull(),

  costType: text().$type<'salary' | 'hourly_rate' | 'per_task_rate'>().notNull(),
  additionalBenefitsPct: text(),

  performanceBonusFormula: text(), // JSON

  notes: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  idxAgentId: index().on(table.agentId),
  idxEffectiveFrom: index().on(table.effectiveFrom),
}));

export const agentCompensation = sqliteTable('agent_compensation', {
  id: text().primaryKey().$defaultFn(() => uuid()),
  agentId: text().notNull(),

  periodStart: text().notNull(), // DATE
  periodEnd: text().notNull(), // DATE

  baseAmount: text().notNull(),
  performanceBonus: text().default('0'),
  deductions: text().default('0'),
  totalAmount: text().notNull(),

  status: text().$type<'accrued' | 'approved' | 'paid'>().notNull(),
  paidOn: timestamp(),

  notes: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  idxAgentId: index().on(table.agentId),
  idxPeriodStart: index().on(table.periodStart),
  idxStatus: index().on(table.status),
}));

export const financialForecasts = sqliteTable('financial_forecasts', {
  id: text().primaryKey().$defaultFn(() => uuid()),

  forecastType: text().$type<'expense' | 'revenue' | 'aggregate'>().notNull(),
  categoryId: text().references(() => financialCategories.id),

  forecastStartDate: text().notNull(), // DATE
  forecastEndDate: text().notNull(), // DATE

  confidenceLevel: text().$type<'low' | 'medium' | 'high'>().notNull(),
  forecastMethod: text().$type<'moving_average' | 'trend' | 'seasonal' | 'scenario'>().notNull(),

  expectedAmount: text().notNull(),
  confidenceIntervalLow: text(),
  confidenceIntervalHigh: text(),

  calculatedAt: timestamp().notNull(),
  basedOnMonths: integer(),

  createdAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  idxForecastType: index().on(table.forecastType),
  idxCategoryId: index().on(table.categoryId),
  idxForecastStartDate: index().on(table.forecastStartDate),
}));

export const financialScenarios = sqliteTable('financial_scenarios', {
  id: text().primaryKey().$defaultFn(() => uuid()),

  name: text().notNull(),
  description: text(),
  scenarioType: text().$type<'predefined' | 'custom'>().notNull(),

  revenueMultiplier: text(),
  expenseMultiplier: text(),
  customAdjustments: text(), // JSON

  projectedRunwayMonths: integer(),
  projectedEndBalance: text(),

  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});

export const spendingRules = sqliteTable('spending_rules', {
  id: text().primaryKey().$defaultFn(() => uuid()),

  scope: text().$type<'global' | 'agent' | 'project' | 'category'>().notNull(),
  scopeId: text(),

  limitType: text().$type<'hard' | 'soft'>().notNull(),
  amountLimit: text().notNull(),
  period: text().$type<'daily' | 'weekly' | 'monthly' | 'yearly'>().notNull(),

  requiresApproval: integer({ mode: 'boolean' }).default(false),
  approvalChain: text(), // JSON array

  isActive: integer({ mode: 'boolean' }).default(true),
  startDate: timestamp(),
  endDate: timestamp(),

  createdBy: text().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  idxScope: index().on(table.scope),
  idxScopeId: index().on(table.scopeId),
  idxIsActive: index().on(table.isActive),
}));

export const financialAuditLog = sqliteTable('financial_audit_log', {
  id: text().primaryKey().$defaultFn(() => uuid()),

  transactionId: text().references(() => financialTransactions.id),
  action: text().$type<'created' | 'updated' | 'approved' | 'rejected'>().notNull(),

  changedFields: text(), // JSON

  performedBy: text().notNull(),
  reason: text(),

  createdAt: timestamp().notNull().defaultNow(),
}, (table) => ({
  idxTransactionId: index().on(table.transactionId),
  idxPerformedBy: index().on(table.performedBy),
  idxCreatedAt: index().on(table.createdAt),
}));

// Relations
export const financialCategoriesRelations = relations(financialCategories, ({ many, one }) => ({
  transactions: many(financialTransactions),
  forecasts: many(financialForecasts),
  parent: one(financialCategories, {
    fields: [financialCategories.parentId],
    references: [financialCategories.id],
  }),
  subcategories: many(financialCategories),
}));

export const financialTransactionsRelations = relations(financialTransactions, ({ one }) => ({
  category: one(financialCategories, {
    fields: [financialTransactions.categoryId],
    references: [financialCategories.id],
  }),
}));
```

### 5.3 Módulo de Serviços Financeiros

```typescript
// packages/mastra-engine/src/finance/finance-service.ts

import { db } from '../db';
import { financialTransactions, financialCategories, agentCosts, agentCompensation, spendingRules } from '../db/schema/financial';
import { eq, and, gte, lte, sum } from 'drizzle-orm';

export class FinanceService {
  // ===== Transaction Management =====

  async recordExpense(data: {
    agentId?: string;
    projectId?: string;
    categoryId: string;
    amount: number;
    description: string;
    referenceId?: string;
    tags?: string[];
    createdBy: string;
  }) {
    const transaction = await db.insert(financialTransactions).values({
      id: uuid(),
      type: 'EXPENSE',
      amount: data.amount.toString(),
      currency: 'USD',
      transactionDate: new Date(),
      recordedDate: new Date(),
      categoryId: data.categoryId,
      agentId: data.agentId,
      projectId: data.projectId,
      description: data.description,
      referenceId: data.referenceId,
      tags: JSON.stringify(data.tags ?? []),
      createdBy: data.createdBy,
      status: 'pending',
    });

    return transaction;
  }

  async recordRevenue(data: {
    projectId?: string;
    categoryId: string;
    amount: number;
    description: string;
    referenceId?: string;
    createdBy: string;
  }) {
    return db.insert(financialTransactions).values({
      id: uuid(),
      type: 'REVENUE',
      amount: data.amount.toString(),
      currency: 'USD',
      transactionDate: new Date(),
      recordedDate: new Date(),
      categoryId: data.categoryId,
      projectId: data.projectId,
      description: data.description,
      referenceId: data.referenceId,
      createdBy: data.createdBy,
      status: 'reconciled',
    });
  }

  // ===== Approval Workflow =====

  async approveTransaction(transactionId: string, approvedBy: string, notes?: string) {
    await db.update(financialTransactions)
      .set({
        status: 'approved',
        approvedBy,
        approvedAt: new Date(),
      })
      .where(eq(financialTransactions.id, transactionId));

    // Log to audit
    await this.auditTransaction(transactionId, 'approved', approvedBy, notes);
  }

  async rejectTransaction(transactionId: string, rejectedBy: string, reason: string) {
    await db.update(financialTransactions)
      .set({
        status: 'rejected',
      })
      .where(eq(financialTransactions.id, transactionId));

    await this.auditTransaction(transactionId, 'rejected', rejectedBy, reason);
  }

  // ===== Spending Controls =====

  async checkSpendingLimits(agentId?: string, projectId?: string, amount: number): Promise<{
    allowed: boolean;
    violations: Array<{ rule: string; reason: string }>;
  }> {
    const violations = [];

    // Check if spending would exceed limits
    const applicableRules = await db.select()
      .from(spendingRules)
      .where(
        and(
          eq(spendingRules.isActive, true),
          sql`(scope = 'global' OR (scope = 'agent' AND scope_id = ${agentId}) OR (scope = 'project' AND scope_id = ${projectId}))`
        )
      );

    for (const rule of applicableRules) {
      const limit = parseFloat(rule.amountLimit);
      if (amount > limit) {
        violations.push({
          rule: rule.id,
          reason: `Exceeds ${rule.periodType} limit of ${rule.currency} ${limit}`,
        });
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
    };
  }

  // ===== Agent Compensation =====

  async calculateAgentCompensation(agentId: string, periodStart: Date, periodEnd: Date) {
    // Get agent cost configuration for period
    const costConfig = await db.select()
      .from(agentCosts)
      .where(
        and(
          eq(agentCosts.agentId, agentId),
          lte(agentCosts.effectiveFrom, periodStart.toISOString().split('T')[0]),
          or(
            eq(agentCosts.effectiveUntil, null),
            gte(agentCosts.effectiveUntil, periodEnd.toISOString().split('T')[0])
          )
        )
      );

    if (!costConfig || costConfig.length === 0) {
      throw new Error(`No cost configuration found for agent ${agentId}`);
    }

    const config = costConfig[0];
    const baseAmount = parseFloat(config.baseCostPerPeriod);
    const benefitsMultiplier = 1 + (parseFloat(config.additionalBenefitsPct ?? '0') / 100);

    // Calculate performance bonus if applicable
    let performanceBonus = 0;
    if (config.performanceBonusFormula) {
      // TODO: Implement bonus calculation logic
      performanceBonus = 0;
    }

    const totalAmount = (baseAmount * benefitsMultiplier) + performanceBonus;

    // Record compensation
    await db.insert(agentCompensation).values({
      id: uuid(),
      agentId,
      periodStart: periodStart.toISOString().split('T')[0],
      periodEnd: periodEnd.toISOString().split('T')[0],
      baseAmount: baseAmount.toString(),
      performanceBonus: performanceBonus.toString(),
      deductions: '0',
      totalAmount: totalAmount.toString(),
      status: 'accrued',
    });

    return { baseAmount, performanceBonus, totalAmount };
  }

  // ===== Financial Forecasting =====

  async calculateForecast(forecastType: 'expense' | 'revenue' | 'aggregate', categoryId?: string, months: number = 3) {
    // Get historical data
    const now = new Date();
    const startDate = new Date(now.setMonth(now.getMonth() - 6));

    const history = await db.select()
      .from(financialTransactions)
      .where(
        and(
          categoryId ? eq(financialTransactions.categoryId, categoryId) : undefined,
          eq(financialTransactions.type, forecastType === 'expense' ? 'EXPENSE' : 'REVENUE'),
          gte(financialTransactions.transactionDate, startDate),
          lte(financialTransactions.transactionDate, new Date()),
          eq(financialTransactions.status, 'reconciled')
        )
      );

    // Calculate moving average
    const total = history.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const average = total / (history.length || 1);

    // Simple forecast: assume trend continues
    const expectedAmount = average * months;
    const confidence = 'medium'; // TODO: improve confidence calculation

    // Calculate confidence intervals
    const stdDev = Math.sqrt(
      history.reduce((sum, t) => sum + Math.pow(parseFloat(t.amount) - average, 2), 0) / (history.length || 1)
    );

    return {
      expectedAmount,
      confidenceIntervalLow: expectedAmount - (2 * stdDev),
      confidenceIntervalHigh: expectedAmount + (2 * stdDev),
      confidenceLevel: confidence,
    };
  }

  // ===== Agent Data Access =====

  async getAgentFinancialData(agentId: string) {
    const compensation = await db.select()
      .from(agentCompensation)
      .where(eq(agentCompensation.agentId, agentId))
      .orderBy(desc(agentCompensation.periodStart));

    const agentExpenses = await db.select()
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.agentId, agentId),
          eq(financialTransactions.type, 'EXPENSE')
        )
      );

    return {
      compensation: compensation.slice(0, 12), // Last 12 periods
      expenses: agentExpenses,
      summary: {
        totalCompensationYTD: compensation.reduce((sum, c) => sum + parseFloat(c.totalAmount), 0),
        totalExpensesYTD: agentExpenses.reduce((sum, t) => sum + parseFloat(t.amount), 0),
      },
    };
  }

  // ===== Audit =====

  private async auditTransaction(transactionId: string, action: string, performedBy: string, reason?: string) {
    await db.insert(financialAuditLog).values({
      id: uuid(),
      transactionId,
      action: action as any,
      performedBy,
      reason: reason ?? null,
      createdAt: new Date(),
    });
  }
}
```

### 5.4 API de Tools para Agentes

```typescript
// packages/mastra-engine/src/agent/tools/finance-tools.ts

import { FinanceService } from '../../finance/finance-service';

export function createFinanceTools(agentId: string, financeService: FinanceService) {
  return {
    // Get my compensation
    getMyCompensation: {
      description: 'Get my historical and projected compensation',
      execute: async () => {
        const data = await financeService.getAgentFinancialData(agentId);
        return {
          currentPeriod: data.compensation[0],
          history: data.compensation,
          summary: data.summary,
        };
      },
    },

    // Get my expenses
    getMyExpenses: {
      description: 'Get expenses I have been allocated to',
      execute: async () => {
        const data = await financeService.getAgentFinancialData(agentId);
        return data.expenses;
      },
    },

    // Check spending status
    getSpendingStatus: {
      description: 'Check current spending against limits',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string' },
        },
        required: ['categoryId'],
      },
      execute: async (input: { categoryId: string }) => {
        // TODO: Implement
        return { status: 'OK', message: 'No limits exceeded' };
      },
    },

    // Request approval for large expense
    requestExpenseApproval: {
      description: 'Request approval for a high-value expense',
      inputSchema: {
        type: 'object',
        properties: {
          amount: { type: 'number' },
          categoryId: { type: 'string' },
          description: { type: 'string' },
          justification: { type: 'string' },
        },
        required: ['amount', 'categoryId', 'description'],
      },
      execute: async (input: any) => {
        const canSpend = await financeService.checkSpendingLimits(agentId, undefined, input.amount);
        if (!canSpend.allowed) {
          return {
            approved: false,
            message: 'Request requires manager approval due to spending limits',
            violations: canSpend.violations,
          };
        }
        return { approved: true, message: 'Within spending limits' };
      },
    },
  };
}
```

---

## 6. Plano de Implementação

### Fase 1: Fundação e Schema (Sprint 1-2)
- [ ] Definir schema completo de tabelas financeiras em Drizzle
- [ ] Criar migrations para 8 novas tabelas
- [ ] Implementar testes unitários para modelos de dados
- [ ] Setup de seeding de dados (categorias padrão, etc)

### Fase 2: Rastreamento de Transações (Sprint 2-3)
- [ ] Implementar `recordExpense()` e `recordRevenue()`
- [ ] Implementar categorização e tags
- [ ] Criar tools de agente para visualizar despesas
- [ ] Implementar auditoria de transações
- [ ] Testes: 100 transações simultâneas sem erro

### Fase 3: Folha de Pagamento (Sprint 3)
- [ ] Implementar agentCosts configuration
- [ ] Implementar cálculo de compensação
- [ ] Criar tools para agentes visualizarem compensação
- [ ] Implementar histórico de mudanças salariais
- [ ] Testes: cálculos de compensação com diferentes períodos

### Fase 4: Previsão Financeira (Sprint 4)
- [ ] Implementar cálculo de moving average
- [ ] Implementar trend analysis
- [ ] Criar cenários (pessimistic, base, optimistic)
- [ ] Dashboard com visualização de forecasts
- [ ] Testes: validar accuracy de forecasts contra histórico

### Fase 5: Controle de Fluxo (Sprint 5)
- [ ] Implementar spending rules engine
- [ ] Implementar approval workflow
- [ ] Implementar hard/soft limits
- [ ] Integrar com workflow engine para bloquear transações
- [ ] Testes: validar bloqueio de gastos acima de limites

### Fase 6: Acesso de Agentes (Sprint 6)
- [ ] Implementar `getAgentFinancialData()` com filtering
- [ ] Criar API de agente com segurança de acesso
- [ ] Criar dashboard de agente
- [ ] Notificações (email/in-app) de eventos financeiros
- [ ] Testes: verificar agentes só veem dados permitidos

### Fase 7: Integração e Polish (Sprint 7)
- [ ] Integrar com agent runtime
- [ ] Dashboard admin completo
- [ ] Documentação de API
- [ ] Performance testing (1M transações)
- [ ] UAT e validação com stakeholders

---

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|--------|-----------|
| Perda de integridade de dados financeiros | Baixa | CRÍTICO | ACID compliance, backup diário, audit log immutável |
| Performance degrada com 1M+ transações | Média | Alto | Índices agressivos, particionamento de dados por data |
| Complexity de cálculos de forecast | Média | Médio | Começar simples (moving avg), evoluir gradually |
| Agentes acessam dados que não deveriam | Média | CRÍTICO | Implementar row-level security, audit access |
| Spending limit bypass via concorrência | Baixa | Alto | Transações DB com isolation level SERIALIZABLE |
| Mudanças em folha de pagamento não auditadas | Baixa | Alto | Histórico de versões, approval workflow obrigatório |

---

## 8. Métricas de Sucesso

### Técnicas
- [ ] 8 tabelas criadas e otimizadas (com índices apropriados)
- [ ] 100% de transações registradas com auditoria
- [ ] Lookup de dados financeiros < 100ms (com cache)
- [ ] Forecast calcula em < 500ms
- [ ] Suporta 1M+ transações sem degradação
- [ ] Zero dados financeiros em plaintext (se encryption habilitado)

### Funcionais
- [ ] Rastreamento completo de despesas e receitas
- [ ] Folha de pagamento calculada automaticamente
- [ ] Previsões financeiras dentro de 10% de accuracy
- [ ] Spending controls bloqueiam gastos acima de limites
- [ ] Agentes acessam seus próprios dados com segurança

### de Negócio
- [ ] Reduzir tempo de financial reconciliation de 2 dias → 2 horas
- [ ] Identificar oportunidades de economia (overspending categories)
- [ ] Melhorar forecasting accuracy de cash runway
- [ ] Aumentar confiança em controles financeiros

---

## 9. Dependências Externas

### Internas
- Drizzle ORM (via PRD-02)
- Communication Module (para rastreamento de custos de agentes)
- Workflow Engine (para enforcement de spending rules)
- Agent Runtime (para integração de tools)

### Externas
- Nenhuma (sem integração com QuickBooks, Stripe, etc Phase 1)

### Compatibilidade
- LibSQL (SQLite) ✅ Suportado
- Node.js 18+ ✅ Decimal arithmetic via string storage

---

## 10. Estimativas

### Tamanho da Feature
**Esforço total:** ~140-160 horas (7 sprints de 2 semanas)

### Breakdown por Fase
1. **Phase 1 (Fundação):** 20h (schema, migrations, testes)
2. **Phase 2 (Transações):** 25h (CRUD, categorização, audit)
3. **Phase 3 (Folha de Pagamento):** 20h (config, cálculos, history)
4. **Phase 4 (Forecast):** 20h (algoritmos, cenários, UI)
5. **Phase 5 (Controle):** 25h (rules, approvals, integration)
6. **Phase 6 (Acesso Agentes):** 20h (API, security, tools)
7. **Phase 7 (Polish):** 20h (integration, docs, testing)

### Story Points (Fibonacci)
- [ ] Epic PRD-19: 55 story points (7 sprints, 1-2 devs full-time)

---

## 11. Documentação Necessária

### Para Desenvolvedores
1. `docs/implementation/financial-schema.md` — Schema Drizzle detalhado
2. `docs/implementation/finance-service-api.md` — API reference completa
3. `docs/implementation/financial-forecasting.md` — Algoritmos de previsão
4. `docs/implementation/spending-rules-engine.md` — Lógica de controle de gastos

### Para Operadores
1. `docs/operations/financial-setup.md` — Configuração inicial
2. `docs/operations/spending-limits.md` — Como definir limites de gasto
3. `docs/operations/payroll-management.md` — Gerenciamento de folha de pagamento
4. `docs/operations/financial-reporting.md` — Relatórios e análises

### Para Agentes/Usuários
1. `docs/user/agent-financial-tools.md` — Tools disponíveis para agentes
2. `docs/user/financial-dashboard.md` — Como acessar seu dashboard financeiro
3. `docs/user/spending-approval.md` — Processo de aprovação de gastos

---

## 12. Critérios de Aceitação

- [ ] Schema financeiro completo implementado em Drizzle
- [ ] Rastreamento de despesas funcionando com categorização e auditoria
- [ ] Rastreamento de receitas funcionando
- [ ] Folha de pagamento calculada corretamente para diferentes períodos
- [ ] Previsões financeiras calculadas e visualizáveis
- [ ] Controles de spending bloqueando gastos acima de limites
- [ ] Agentes conseguem acessar seus dados financeiros
- [ ] Dashboard financeiro mostrando overview de receita/despesa/lucro
- [ ] Auditoria completa de todas as transações
- [ ] Documentação técnica e operacional completa
- [ ] Performance: lookup < 100ms, forecast < 500ms, suporta 1M+ transações
- [ ] Testes: cobertura > 80%, incluindo edge cases

---

## 13. Próximos Passos Recomendados

### Imediato (Antes de iniciar Phase 1)
1. **Revisar com stakeholders:** Apresentar requisitos de categorização e limites
2. **Definir período de folha de pagamento:** Mensal? Semanal? Por tarefa?
3. **Gerar dados de teste:** Preparar 6+ meses de histórico financeiro
4. **Setup ambiente:** Criar schema inicial no DB de dev/test

### Após Phase 2 (Transações)
1. **Integração com imports:** Suporte a importação de CSV/Excel
2. **Bank reconciliation:** Matching de transações com extratos bancários
3. **Relatórios customizados:** Builder de relatórios financeiros

### Após Phase 4 (Forecast)
1. **Machine Learning:** Melhorar accuracy com modelos mais avançados
2. **Seasonal adjustments:** Considerar padrões sazonais automáticamente
3. **Anomaly detection:** Alertar sobre gastos anormais

### Fase 2 - Integração Externa
1. **Integração com QuickBooks:** Sincronizar transações com QB
2. **Integração com Stripe:** Rastreamento de pagamentos de clientes
3. **Integração com Slack:** Notificações de eventos financeiros

---

**Preparado por:** Análise Detalhada (Agent)
**Data:** 2026-03-15
**Próxima revisão:** Após Phase 1 (design review técnico)

---

## Apêndice A: Exemplo de Uso End-to-End

### Scenario: Criar Agente com Rastreamento Financeiro

```typescript
// 1. Setup: Definir categorias padrão (uma vez)
const financeService = new FinanceService(db);

await db.insert(financialCategories).values([
  {
    id: 'cat-infrastructure',
    name: 'Infrastructure',
    type: 'EXPENSE',
    budgetLimit: '50000', // $50k monthly
  },
  {
    id: 'cat-personnel',
    name: 'Personnel',
    type: 'EXPENSE',
    budgetLimit: '500000', // $500k monthly
  },
  {
    id: 'cat-consulting',
    name: 'Consulting Revenue',
    type: 'REVENUE',
  },
]);

// 2. Configure agent cost
await financeService.agentCosts.create({
  agentId: 'agent-123',
  effectiveFrom: '2026-03-01',
  baseCostPerPeriod: '5000',
  periodType: 'monthly',
  costType: 'salary',
  additionalBenefitsPct: '20', // 20% overhead
});

// 3. Record monthly expenses
await financeService.recordExpense({
  agentId: 'agent-123',
  categoryId: 'cat-infrastructure',
  amount: 2500,
  description: 'AWS infrastructure costs',
  referenceId: 'aws-bill-2026-03',
  createdBy: 'admin-001',
});

// 4. Record revenue from project
await financeService.recordRevenue({
  projectId: 'proj-acme-automation',
  categoryId: 'cat-consulting',
  amount: 15000,
  description: 'Automation project invoice',
  referenceId: 'inv-2026-001',
  createdBy: 'admin-001',
});

// 5. Calculate forecast for next quarter
const forecast = await financeService.calculateForecast('expense', 'cat-infrastructure', 3);
console.log(`Infrastructure spending forecast: $${forecast.expectedAmount}/3 months`);

// 6. Agent checks their compensation
const tools = createFinanceTools('agent-123', financeService);
const compensation = await tools.getMyCompensation.execute();
console.log(`My compensation this month: $${compensation.currentPeriod.totalAmount}`);

// 7. Agent requests approval for large expense
const approval = await tools.requestExpenseApproval.execute({
  amount: 10000,
  categoryId: 'cat-infrastructure',
  description: 'New database server',
  justification: 'Performance bottleneck identified',
});
// Response: { approved: false, violations: [...] }
// → Requires manager approval

// 8. Admin approves transaction
await financeService.approveTransaction(transactionId, 'manager-001', 'Budget approved');

// 9. Admin views financial dashboard
const dashboard = {
  totalRevenueThisMonth: await getMetric('revenue', 'month'),
  totalExpensesThisMonth: await getMetric('expenses', 'month'),
  profit: revenue - expenses,
  runwayMonths: totalCash / monthlyBurn,
  forecastedCash: forecast3MonthsCash,
};
```

---

**FIM DO DOCUMENTO**

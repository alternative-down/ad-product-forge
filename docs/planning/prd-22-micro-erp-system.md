# PRD-22: Sistema de Fluxo de Caixa e Micro-ERP

> **Nota:** Este é um projeto pessoal para desenvolvedor solo. Aplicar KISS + YAGNI. Este PRD é o mecanismo **core** que traz controle e accountability aos agentes.

**Classificação:** APLICAÇÃO AD-PRODUCT-FORGE

---

## 1. Visão Geral

### Objetivo

Estruturar um **"caixa da empresa"** centralizado que permite:
- Nicolas (proprietário) controlar os recursos da plataforma
- Agentes gerenciarem a empresa digital e serem responsáveis por ter lucro
- Rastrear e visualizar os dados financeiros para tomadas de decisão

### Dinâmica Operacional

1. **Nicolas faz aportes iniciais** → libera saldo para agentes operarem
2. **Agentes gerenciam com saldo disponível** → responsáveis por gastos e receitas
3. **Com tração** → agentes ficam por conta própria
4. **Nicolas faz saques** → quando há lucro para retirar

### Impacto

Este é o mecanismo que traz **controle e accountability** aos agentes. Eles precisam gerenciar recursos reais e ter lucro, não é simulação.

---

## 2. Escopo

### Rastreado no Caixa

**Custos:**
- Contratação de novos agentes (salário inicial/setup)
- Custos operacionais diários de cada agente (quanto custa rodar cada um em $)
- Custos de APIs e serviços externos
- Custos base de infraestrutura (servidor, domínio, etc.)

**Receitas:**
- Recebimentos de clientes/aplicações (Stripe, Asaas)
- Previsões de receitas futuras

**Fluxo:**
- Contas a pagar com histórico
- Contas a receber com histórico
- Saldo disponível
- Previsões

### Acesso para Agentes

- **Visualizar dados**: Agentes podem ver dados financeiros relevantes
- **Views customizadas**: Agentes criam suas próprias visualizações de dados
- **Queries diretas**: Agentes rodam queries diretas para coletar informações que querem
- **Folha de pagamento**: Cada agente sabe quanto custa (em $) para rodar

### Não Incluído

- Fluxos de trabalho de aprovação complexos
- Algoritmos preditivos avançados
- Integração com software de contabilidade externa (QuickBooks, Xero, etc.)
- Dashboard UI
- Suporte a múltiplas moedas

---

## 3. Requisitos

### RF-1: Registrar Transação
```typescript
interface LogTransactionParams {
  type: 'expense' | 'revenue';
  category: string; // ex: 'agent_salary', 'api_cost', 'infrastructure', 'customer_payment'
  amount: number;
  description: string;
  relatedAgentId?: string; // opcional, para rastrear custos por agente
  relatedApplicationId?: string; // opcional, para receitas de apps
  scheduledFor?: Date; // para previsões/contas futuras
}

// Retorna: { transactionId, success }
```

### RF-2: Consultar Saldo e Resumo
```typescript
interface GetCashFlowSummaryParams {
  periodStart?: Date; // padrão: início do mês
  periodEnd?: Date; // padrão: hoje
}

// Retorna: {
//   totalExpenses: number;
//   totalRevenues: number;
//   netProfit: number;
//   balance: number; // saldo disponível
//   expectedRevenues: number; // previsões
//   expectedExpenses: number; // previsões
// }
```

### RF-3: Listar Transações
```typescript
interface ListTransactionsParams {
  filters?: {
    type?: 'expense' | 'revenue';
    category?: string;
    agentId?: string;
    applicationId?: string;
    dateRange?: { start: Date; end: Date };
  };
  limit?: number; // padrão: 100
  offset?: number; // padrão: 0
}

// Retorna: array de transações com detalhes
```

### RF-4: Criar View Customizada (por agente)
```typescript
interface CreateCustomViewParams {
  agentId: string;
  name: string; // ex: "Meus custos mensais"
  query: string; // SQL para executar
  description?: string;
}

// Retorna: { viewId, success }
```

### RF-5: Executar Query Direta (por agente)
```typescript
interface ExecuteQueryParams {
  agentId: string;
  query: string; // SQL com scope limitado ao agente
}

// Retorna: { results: array, success }
// Nota: Query é validada para não acessar dados de outros agentes
```

### RF-6: Calcular Custo de Agente
```typescript
interface GetAgentCostParams {
  agentId: string;
  period?: 'daily' | 'weekly' | 'monthly'; // padrão: monthly
}

// Retorna: {
//   agentId: string;
//   totalCost: number; // em $
//   breakdown: {
//     salary: number;
//     apiUsage: number;
//     infrastructure: number;
//     // ...
//   };
// }
```

---

## 4. Banco de Dados

**Tabela: financial_transactions**
```typescript
{
  id: UUID (primary key)
  type: 'expense' | 'revenue'
  category: string
  amount: decimal(12, 2)
  description: string
  related_agent_id?: UUID
  related_application_id?: UUID
  scheduled_for?: timestamp (para previsões)
  created_at: timestamp
  recorded_by: UUID (quem registrou - Nicolas ou sistema)
}
```

**Tabela: agent_costs** (cache/historical)
```typescript
{
  id: UUID
  agent_id: UUID
  period_start: date
  period_end: date
  total_cost: decimal(12, 2)
  breakdown: JSON (detalhamento: salary, api, infrastructure, etc.)
  calculated_at: timestamp
}
```

**Tabela: financial_views** (customizadas por agentes)
```typescript
{
  id: UUID
  agent_id: UUID
  name: string
  query: string
  description?: string
  created_at: timestamp
  last_executed_at?: timestamp
}
```

---

## 5. Segurança e Isolamento

- Agentes **não podem** acessar dados financeiros de outros agentes
- Queries são validadas e scopadas para apenas dados visíveis ao agente
- Registros de transações são auditados (quem registrou, quando)
- Apenas Nicolas pode fazer aportes e saques

---

## 6. Critérios de Sucesso

- [ ] Consegue registrar despesas e receitas
- [ ] Agentes conseguem visualizar dados relevantes
- [ ] Agentes conseguem criar views customizadas
- [ ] Cálculo de custos por agente está correto
- [ ] Saldo e previsões são calculados corretamente
- [ ] Isolamento de dados entre agentes funciona

---

**Fim do documento**

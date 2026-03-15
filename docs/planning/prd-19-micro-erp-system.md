# PRD-19: Micro-ERP System (Simplified)

**Status:** Draft - Simplified for Solo Developer
**Date:** 2026-03-15
**Note:** Personal developer project. Apply KISS + YAGNI principles.

---

## 1. Summary

### Objective
Track simple financial metrics (expenses, revenues).

### Value
- Understand costs of running agents
- Track revenue generated
- Simple forecasting

### Important Note
This is a personal project. Skip complex features like:
- Approval workflows
- Budget limits
- Compliance reporting
- Integration with external accounting software

---

## 2. Scope

### Included
- Log expenses (cost category, amount, description)
- Log revenues (source, amount, description)
- Calculate agent costs (simple)
- Basic reporting

### Not Included
- Approval workflows
- Budget enforcement
- Forecasting algorithms
- Scenario analysis
- Dashboard UI
- Integration with QuickBooks/Xero
- Payroll management
- Multi-currency support
- Tax/compliance reporting

---

## 3. Requirements

### RF-1: logExpense Tool
```typescript
interface LogExpenseParams {
  category: string; // 'infrastructure', 'tools', 'other'
  amount: number;
  description: string;
  date?: Date;
}

// Returns: { id: string, status: 'logged' }
```

### RF-2: logRevenue Tool
```typescript
interface LogRevenueParams {
  source: string;
  amount: number;
  description: string;
  date?: Date;
}

// Returns: { id: string, status: 'logged' }
```

### RF-3: getFinancialSummary Tool
```typescript
interface GetFinancialSummaryParams {
  period?: 'month' | 'year'; // default: current month
}

// Returns: {
//   totalExpenses: number;
//   totalRevenues: number;
//   netProfit: number;
//   byCategory: Record<string, number>;
// }
```

### RF-4: getAgentCost Tool
```typescript
interface GetAgentCostParams {
  agentId: string;
  period?: 'month' | 'year';
}

// Returns: {
  //   totalCost: number;
//   revenue: number;
//   roi: number; // %
// }
```

---

## 4. Database

```sql
CREATE TABLE financial_log (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- 'expense' or 'revenue'

  category TEXT,
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT,

  agent_id TEXT,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_type (type),
  INDEX idx_agent_id (agent_id),
  INDEX idx_logged_at (logged_at)
);
```

---

## 5. Implementation

### Phase 1: Financial Logging (4h)
- Simple table for expenses/revenues
- Implement 2 tools: logExpense, logRevenue

### Phase 2: Reporting (3h)
- Implement getFinancialSummary, getAgentCost
- Basic calculations (sum, average)

### Phase 3: Testing (2h)
- Unit tests
- Sample data

---

## 6. Success Criteria
- [ ] Can log expenses and revenues
- [ ] Can view financial summary
- [ ] Can calculate agent ROI
- [ ] Data is secure

---

## 7. Status
**Deferred** - Nice to have, not essential for MVP.

---

## 8. Effort
- Total: ~9 hours

---

**End of document**

# PRD-20: Cash Flow Control (Simplified)

**Status:** Draft - Simplified for Solo Developer
**Date:** 2026-03-15
**Note:** Personal developer project. Apply KISS + YAGNI principles.

---

## 1. Summary

### Objective
Simple spending limits for agents to prevent budget overruns.

### Value
- Agents know how much they can spend
- Prevent overspending
- Simple alerts

### Important Note
This is a personal project. Skip:
- Emergency protocols
- Complex constraint engines
- Multi-agent resource fairness
- Graceful degradation
- Integration with external data sources

---

## 2. Scope

### Included
- Set spending limit per agent (monthly)
- Check remaining budget before action
- Alert when limit approaching
- Simple logging

### Not Included
- Emergency protocols
- Constraint escalation
- Multi-agent fairness
- Dynamic reallocation
- Forecasting
- External financial data integration
- Approval workflows
- UI dashboard

---

## 3. Requirements

### RF-1: getCashFlowStatus Tool
```typescript
interface GetCashFlowStatusParams {
  agentId?: string;
}

// Returns: {
//   totalBudget: number;
//   spent: number;
//   remaining: number;
//   percentUsed: number;
// }
```

### RF-2: evaluateAction Tool
```typescript
interface EvaluateActionParams {
  agentId: string;
  estimatedCost: number;
}

// Returns: {
//   allowed: boolean;
//   message?: string; // "Budget exceeded" or "OK, 50% remaining"
// }
```

### RF-3: logAction Tool
```typescript
interface LogActionParams {
  agentId: string;
  actionType: string;
  estimatedCost: number;
  actualCost?: number;
  description?: string;
}

// Returns: { logged: true }
```

### RF-4: setSpendingLimit Tool
```typescript
interface SetSpendingLimitParams {
  agentId: string;
  monthlyLimit: number;
}

// Returns: { success: true }
```

---

## 4. Database

```sql
CREATE TABLE spending_limits (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL UNIQUE,
  monthly_limit DECIMAL(10, 2) NOT NULL,
  period_start DATE,
  period_end DATE,

  INDEX idx_agent_id (agent_id)
);

CREATE TABLE spending_log (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  action_type TEXT,
  estimated_cost DECIMAL(10, 2),
  actual_cost DECIMAL(10, 2),
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_agent_id (agent_id),
  INDEX idx_logged_at (logged_at)
);
```

---

## 5. Implementation

### Phase 1: Spending Limits (2h)
- Create spending_limits table
- Implement setCashFlowLimit, getCashFlowStatus

### Phase 2: Action Evaluation (2h)
- Implement evaluateAction
- Check against limits

### Phase 3: Logging (1h)
- Implement logAction
- Simple logging

### Phase 4: Testing (2h)
- Unit tests
- Integration tests

---

## 6. Success Criteria
- [ ] Can set spending limit per agent
- [ ] Can check remaining budget
- [ ] Can evaluate action cost
- [ ] Logs actions
- [ ] Alerts when limit approaching

---

## 7. Status
**Deferred** - Nice to have, not essential for MVP.

---

## 8. Effort
- Total: ~7 hours

---

**End of document**

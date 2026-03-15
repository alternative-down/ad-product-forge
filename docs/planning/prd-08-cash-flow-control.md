# PRD-20: Cash Flow Control (Simplified)

**Status:** Draft - Simplified for Solo Developer
**Date:** 2026-03-15
**Note:** Personal developer project. Apply KISS + YAGNI principles.

---

## 1. Summary

### Classification: AD-PRODUCT-FORGE APPLICATION (OPTIONAL)

**This PRD describes cost control features specific to ad-product-forge.** Budget limits and spending controls enable Nicolas to manage agent costs as the platform scales. Currently optional, deferred until multiple agents require budget management.

### Objective
**OPTIONAL** - Set monthly spending limits per agent.

### Why Deprioritized
- Solo dev can manually track budget
- Not needed for MVP (only 1-2 agents initially)
- Can add if/when scaling to multiple agents
- Value-to-effort ratio too low currently

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

## 3. Minimal Requirements (if implemented)

### RF-1: setSpendingLimit Tool
```typescript
interface SetSpendingLimitParams {
  agentId: string;
  monthlyLimit: number; // USD
}

// Returns: success: boolean
```

### RF-2: getSpendingStatus Tool
```typescript
interface GetSpendingStatusParams {
  agentId: string;
}

// Returns: {
//   limit: number;
//   spent: number;
//   remaining: number;
// }
```

---

## 4. Database (Minimal)

```sql
CREATE TABLE agent_spending_limits (
  agent_id TEXT PRIMARY KEY,
  monthly_limit DECIMAL(10, 2)
);
```

Note: Use existing financial_log from PRD-19 to calculate current month spending.

---

## 5. Implementation (if needed)

- Create single table: agent_spending_limits
- Implement setSpendingLimit, getSpendingStatus (2-3h total)
- Use financial_log from PRD-19 for calculation

---

## 6. Success Criteria
- [ ] Can set spending limit per agent
- [ ] Can view current month spending
- [ ] Can see remaining budget

---

## 7. Status
**Deferred** - Nice to have, not essential for MVP.

---

## 7. Effort
- **Total: 2-3 hours** (if implemented)

---

**End of document**

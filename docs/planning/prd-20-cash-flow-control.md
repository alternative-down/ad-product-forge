# PRD-20: Cash Flow Control

## 1. Executive Summary

**Feature Name:** Cash Flow Control

**Objective:** Implement comprehensive cash flow monitoring and control mechanisms that enable agents to autonomously manage financial constraints, prioritize actions based on available funds, and restrict operations when cash flow falls below critical thresholds.

**Business Value:**
- Prevents financial overextension through proactive action limitation
- Enables intelligent resource allocation based on real-time cash position
- Supports cost optimization and spending constraint enforcement
- Provides transparent financial decision-making at agent level
- Protects system from budget exhaustion in multi-agent environments

**Priority:** High (Critical for financial governance in autonomous systems)

**Timeline Estimate:** 5-7 weeks

---

## 2. Problem Statement

### Current State
- Agents operate without direct visibility into organizational cash flow status
- No mechanism to restrict agent actions based on financial constraints
- Spending decisions are not integrated with liquidity analysis
- Cannot dynamically adjust agent behavior based on financial health
- Missing real-time cash flow monitoring for autonomous operations

### Challenges
- Agents need to understand financial implications of their actions
- System must enforce hard limits on spending across multiple agents simultaneously
- Different agent types may have different financial priorities and constraints
- Must integrate with external financial data sources and APIs
- Requires sophisticated prioritization algorithms when resources are scarce
- Needs to provide clear audit trail for all financial decisions

### Impact
- Risk of financial overextension in autonomous multi-agent scenarios
- Inability to enforce organizational spending policies at runtime
- Missing competitive advantage in capital-constrained operations
- Reduced operational visibility and control over financial outcomes
- Potential system instability during cash flow crises

---

## 3. Goals & Success Criteria

### Primary Goals

1. **Real-Time Cash Flow Analysis:** Implement continuous monitoring and analysis of financial position with sub-second latency
2. **Intelligent Action Control:** Enable agents to query cash flow status and receive actionable recommendations for operation prioritization
3. **Constraint Enforcement:** Automatically limit or deny agent actions that would violate financial constraints
4. **Multi-Agent Coordination:** Fairly distribute limited resources among competing agents based on priority and impact
5. **Financial Transparency:** Provide comprehensive audit trail and reporting of all financial constraints applied to agents
6. **Emergency Protocols:** Implement graceful degradation when cash flow reaches critical levels

### Success Criteria

- [ ] Cash flow analysis operations complete in < 100ms (including external data fetch)
- [ ] Agents can query cash flow status and receive prioritization recommendations with 99.9% reliability
- [ ] All action restrictions are logged with context (reason, financial metrics, alternative options)
- [ ] System correctly handles multiple agents competing for limited resources within defined rules
- [ ] Financial constraint violations are prevented with 100% accuracy during normal operations
- [ ] System maintains operability during 30-minute outage of financial data sources
- [ ] Audit reports can be generated for any time period with complete financial decision history
- [ ] Emergency spending restrictions can be activated/deactivated within 5 minutes

---

## 4. User Stories & Use Cases

### Use Case 1: Sales Agent with Limited Marketing Budget

**Actor:** Sales Operations Agent

**Scenario:** A sales agent needs to launch a marketing campaign to pursue a high-value opportunity, but the organization is approaching monthly marketing budget limits due to other agent spending.

**Flow:**
1. Sales agent queries `getCashFlowStatus()` to check available budget
2. System returns:
   - Total marketing budget: $50,000
   - Spent so far: $47,000
   - Remaining: $3,000
   - 15 agents are also requesting funds
3. Agent receives recommendations with priority ranking:
   - Option A: Launch minimal campaign ($2,500 spend) - recommended given constraints
   - Option B: Launch full campaign ($8,000 spend) - would exceed budget
   - Option C: Wait 2 days when new budget cycle begins
4. Sales agent chooses Option A and proceeds
5. System logs decision: campaign launch approved with constrained spend due to cash flow limits

**Acceptance Criteria:**
- Status query completes in < 100ms
- Recommendations are accurate and actionable
- System prevents budget overrun if agent ignores recommendations
- Audit trail shows decision context and alternatives considered

### Use Case 2: Research Agent During Cash Flow Crisis

**Actor:** Research & Development Agent

**Scenario:** The organization faces unexpected cash flow crisis (major client payment delayed). System must reduce spending across all agents while maintaining critical operations.

**Flow:**
1. Finance admin activates emergency protocol: `activateEmergencyConstraints(severity: 'critical')`
2. System broadcasts financial constraint update to all agents
3. Research agent receives update showing:
   - Cash position: $5,000 (critical)
   - New restrictions: Only essential operations allowed
   - Maximum daily spend per agent: $100
   - Operations classified as "essential": data processing, model training
4. Research agent attempts to run expensive simulation ($500 cost)
5. System denies request with explanation: "Operation cost exceeds emergency constraint ($100 limit)"
6. Agent adjusts strategy and processes available data instead
7. After 6 hours, cash position improves; normal constraints resume

**Acceptance Criteria:**
- Emergency protocol activation takes < 5 minutes
- All agents receive constraint updates within 30 seconds
- System enforces constraints consistently across all agents
- Once emergency is resolved, normal operations resume automatically

### Use Case 3: Multi-Agent Revenue Optimization

**Actor:** Portfolio Optimization Agent (parent agent managing child agents)

**Scenario:** Parent agent needs to allocate limited resources among 10 child agents to maximize return on investment, given different revenue potentials and risks.

**Flow:**
1. Parent agent queries financial position:
   - Available capital: $100,000
   - 10 child agents with different ROI projections:
     - Agent A: 45% ROI, cost $20,000 → expected return: $29,000
     - Agent B: 30% ROI, cost $15,000 → expected return: $19,500
     - Agent C: 25% ROI, cost $10,000 → expected return: $12,500
     - [7 more agents...]
2. Parent agent calls `optimizeResourceAllocation(agentsWithProjections)`
3. System returns optimized allocation considering:
   - Projected returns
   - Risk profiles
   - Historical accuracy of projections
   - Organizational risk tolerance
4. System recommends allocation that maximizes expected return: ~$95,000 allocated
5. Parent agent approves allocation
6. Each child agent receives their budget allocation and can operate within that constraint
7. System tracks actual vs. projected returns for future optimization

**Acceptance Criteria:**
- Optimization algorithms complete in < 1 second
- Allocation respects all constraints and priorities
- System tracks actual results for algorithm validation
- Parent agent can adjust allocation dynamically

### Use Case 4: Predictive Constraint Management

**Actor:** Finance Operations Agent

**Scenario:** Finance agent needs to forecast potential cash flow issues and proactively manage constraints before crisis occurs.

**Flow:**
1. Finance agent queries `getForecastedCashFlowTrend(days: 30)`
2. System analyzes:
   - Current spending rate by agent
   - Expected revenue timing
   - Seasonal patterns
   - Known future obligations
3. System returns forecast:
   - Day 15: Projected cash position drops to $30,000 (yellow flag)
   - Day 22: Projected cash position drops to $5,000 (red flag - critical)
   - Day 25: Major revenue expected, position returns to healthy
4. Finance agent proactively schedules constraint escalation:
   - `scheduleConstraintEscalation(date: day15, severity: 'warning')`
   - `scheduleConstraintEscalation(date: day22, severity: 'critical')`
5. System automatically activates warnings/constraints on schedule
6. Agents prepare for constraints in advance
7. Actual cash crisis is mitigated through proactive management

**Acceptance Criteria:**
- Forecasting algorithms complete in < 500ms
- Forecasts are accurate within 15% margin
- Scheduled constraints activate automatically at correct time
- Agents can prepare and adjust strategies in advance

### Use Case 5: Cost Attribution and Agent Accountability

**Actor:** CFO / Finance Department

**Scenario:** Organization needs to understand which agents are driving costs and ensure spending is aligned with business priorities.

**Flow:**
1. CFO runs report: `generateCostAttributionReport(period: 'Q1', breakdown: 'by_agent')`
2. System returns comprehensive report:
   - Agent X: $45,000 (32% of total, ROI: 150%)
   - Agent Y: $32,000 (23% of total, ROI: 85%)
   - Agent Z: $28,000 (20% of total, ROI: 120%)
   - [more agents...]
3. Report includes:
   - Cost trends over time
   - Action types driving costs
   - Financial decisions made under constraints
   - Alternative actions rejected due to cash flow limits
   - Impact of constraint enforcement on outcomes
4. CFO adjusts agent prioritization based on ROI
5. Finance agent uses insights to refine constraint policies for next quarter

**Acceptance Criteria:**
- Reports generate in < 5 seconds
- Cost attribution is 100% accurate
- Reports are queryable across multiple dimensions
- Data supports strategic decision-making

---

## 5. Functional Requirements

### 5.1 Cash Flow Monitoring & Analysis

**FR-1: Real-Time Cash Flow Dashboard**
- Implement unified cash position tracking aggregating multiple data sources:
  - Bank account balances
  - Accounts payable and accounts receivable
  - Committed expenses from agent operations
  - Forecasted revenue
- Update with configurable refresh interval (default: 30 seconds)
- Provide status via RESTful API and agent tools
- Support multiple currency handling with conversion rates

**FR-2: Financial Data Source Integration**
- Integrate with external financial systems:
  - Banking APIs (Stripe, Plaid, direct bank APIs)
  - Accounting software (QuickBooks, Xero, etc.)
  - Payment processors (Stripe, PayPal, etc.)
  - Custom financial data sources via webhook
- Implement retry logic with exponential backoff
- Cache data with TTL to handle source unavailability (max 5 minutes staleness)
- Validate data integrity and flag anomalies

**FR-3: Cash Flow Velocity Analysis**
- Calculate real-time cash burn rate
- Analyze spending patterns by:
  - Agent
  - Action type
  - Time period (hourly, daily, weekly)
  - Cost category
- Detect anomalous spending patterns (deviation > 3 sigma)
- Provide trend analysis (acceleration, deceleration)
- Support forecasting of future cash position

**FR-4: Financial Metric Calculation**
- Compute key metrics accessible to agents:
  - Available cash (total - held reserves)
  - Runway (days until cash depleted at current burn rate)
  - Burn rate (daily, hourly)
  - Available budget by constraint category
  - Percentage of budget consumed (by category)
  - Projected cash position for next N days
- Implement efficient calculation (< 50ms for all metrics)
- Cache metrics with 30-second TTL

### 5.2 Action Constraint & Prioritization

**FR-5: Financial Constraint Definitions**
- Support configurable constraint types:
  - **Hard limits:** Absolute maximum spend (daily, weekly, monthly, yearly)
  - **Soft limits:** Warning threshold (agent can exceed with notification)
  - **Quota-based:** Fixed allocation per agent or agent type
  - **Percentage-based:** Spend up to X% of total budget
  - **Role-based:** Different limits for different agent roles
  - **Time-based:** Constraints that activate/deactivate by schedule
- Constraints can be defined at:
  - Organization level (global constraints)
  - Agent type level (all research agents, all sales agents, etc.)
  - Individual agent level
  - Action type level (specific operations have specific limits)

**FR-6: Agent Action Evaluation**
- Before agent executes expensive action, query system:
  ```typescript
  const evaluation = await cashflow.evaluateAction({
    agentId: 'agent-xyz',
    actionType: 'marketing_campaign',
    estimatedCost: 5000,
    expectedReturn: 25000,
    duration: '2 weeks'
  });
  // Returns: {
  //   allowed: boolean,
  //   reason?: string,
  //   alternatives?: { cost, benefit, description }[],
  //   recommendation?: string,
  //   constraintContext: { availableBudget, dailyLimit, urgency }
  // }
  ```
- Evaluation considers:
  - Current cash position vs. action cost
  - Agent's consumed budget so far
  - Other agents' pending actions
  - Financial constraints
  - Historical impact of similar actions
- Decision is made in < 100ms

**FR-7: Multi-Agent Resource Fairness**
- When resources are limited and multiple agents request funds:
  - Implement fair queuing mechanism
  - Prioritize based on:
    - Agent role and permission level
    - Projected return on investment
    - Historical performance
    - Time since last allocation
    - Criticality of action
  - Allocate fractions of requested resources if necessary
  - Queue requests and process in priority order
- Provide transparency: agents can see queue position and estimated allocation time

**FR-8: Action Execution with Cost Tracking**
- When agent executes action:
  - Deduct estimated cost from available budget immediately
  - Track actual cost as it occurs
  - Adjust remaining budget based on actuals
  - If actual exceeds estimate by >20%, log deviation and alert
  - Support cost corrections if initial estimate was significantly inaccurate
- Maintain detailed cost ledger:
  - Agent ID
  - Action type
  - Estimated cost
  - Actual cost
  - Timestamp
  - Financial constraint status at execution time
  - Outcome/return if applicable

### 5.3 Emergency & Constraint Escalation

**FR-9: Emergency Protocol Activation**
- Support emergency constraint activation with severity levels:
  - **Warning:** Cash position < 25% of monthly burn
  - **Yellow:** Cash position < 15% of monthly burn
  - **Red/Critical:** Cash position < 5% of monthly burn
- Emergency activation can be:
  - Automatic (triggered by cash flow thresholds)
  - Manual (initiated by finance admin)
- When activated:
  - Broadcast constraint update to all agents within 30 seconds
  - Reduce spend limits proportionally across all agents
  - Classify actions as "essential" vs. "non-essential"
  - Block all non-essential actions
  - Queue non-essential actions for later execution

**FR-10: Graceful Degradation Strategy**
- Define action priority tiers:
  - Tier 1 (Essential): Revenue-generating, critical infrastructure
  - Tier 2 (Important): Support operations, maintenance
  - Tier 3 (Nice-to-have): Optimization, analytics, improvement
- Under financial constraints:
  - Only Tier 1 actions are allowed
  - When crisis passes, restore Tier 2, then Tier 3
- Support role-based tiers (different roles have different Tier 1 operations)

**FR-11: Constraint Duration & Escalation**
- Support constraint scheduling:
  - Scheduled constraints (activate at specific date/time)
  - Escalating constraints (severity increases over time if conditions worsen)
  - Recovery constraints (gradually restore limits as cash position improves)
- Agents receive advance notice (configurable, default: 1 hour)
- Automatic deactivation when conditions improve

### 5.4 Agent Integration & Transparency

**FR-12: Agent-Facing Cash Flow API**
- Provide agent tools and APIs:
  ```typescript
  interface CashFlowTools {
    // Query current status
    getCashFlowStatus(): Promise<CashFlowStatus>;

    // Get personalized guidance
    getSpendingRecommendations(context: OperationContext): Promise<Recommendation[]>;

    // Evaluate action feasibility
    evaluateAction(action: AgentAction): Promise<ActionEvaluation>;

    // Query forecasts
    getForecastedCashFlowTrend(days: number): Promise<Forecast>;

    // Check constraints applicable to this agent
    getApplicableConstraints(): Promise<Constraint[]>;

    // Request budget allocation
    requestBudgetAllocation(amount: number, justification: string): Promise<AllocationResult>;

    // Query cost attribution
    getMySpendingMetrics(period: string): Promise<SpendingMetrics>;
  }
  ```
- All APIs return data within 100ms
- Support caching to minimize query load

**FR-13: Agent Notification System**
- Notify agents when:
  - They approach spending limits (at 80%, 95%, 100%)
  - Emergency constraints are activated
  - Their action is denied due to cash flow constraints
  - Scheduled constraints are coming (1 hour notice)
  - Cash position improves, constraints are relaxed
- Include context in notifications:
  - Current metrics
  - Reason for constraint
  - Alternative actions if applicable
  - Estimated resolution time

**FR-14: Financial Decision Logging**
- Log every significant financial decision:
  - Constraint applied/removed
  - Action approved/denied
  - Cost deviated from estimate
  - Budget allocation approved/denied
  - Emergency protocol activated/deactivated
- Log entry includes:
  - Timestamp
  - Agent ID
  - Action type
  - Financial metrics at time of decision
  - Constraints that applied
  - Final decision and reason
  - Outcome/impact if known

### 5.5 Integration with Existing Systems

**FR-15: Integration with Agent Execution Engine**
- Integrate cost checking into agent action execution pipeline:
  - Before action starts: check constraints
  - During action: monitor actual costs
  - After action: reconcile actual vs. estimated
- Provide hooks for:
  - `onBeforeAction()` — check if action is feasible
  - `onDuringAction()` — track actual costs
  - `onAfterAction()` — reconcile and update ledger
- Support dry-run mode: evaluate action without committing costs

**FR-16: Integration with Role/Permission System**
- Link financial constraints to roles:
  - Each role has associated spend limits
  - Agents inherit limits from their role
  - Can be overridden at agent level
  - Support role templates with constraints built-in
- Implement approval workflows:
  - Actions exceeding constraint require approval
  - Approver can be: supervisor agent, human admin, or automated policy
  - Support delegation of approval authority

**FR-17: Integration with Memory System**
- Store in agent memory:
  - Personal spending history and trends
  - Budget allocation decisions
  - Constraints applied and reasons
  - Financial performance metrics
- Use memory to:
  - Improve action recommendations over time
  - Detect behavioral patterns
  - Support agent learning from financial constraints

---

## 6. Non-Functional Requirements

### 6.1 Performance
- **RNF-1:** Cash flow analysis < 100ms (including external data fetch with fallback)
- **RNF-2:** Action evaluation < 100ms
- **RNF-3:** Constraint enforcement has zero overhead when constraints are not active
- **RNF-4:** Support 1000+ concurrent agents querying cash flow simultaneously
- **RNF-5:** Ledger writes must not block agent execution (async, queued)
- **RNF-6:** Forecast calculations < 500ms for 90-day forecasts

### 6.2 Reliability
- **RNF-7:** Cash flow constraint enforcement: 99.99% accuracy (false negatives are unacceptable)
- **RNF-8:** System remains operational if external financial data source is unavailable (use cached data)
- **RNF-9:** Constraint enforcement continues during network outages (use local state)
- **RNF-10:** No financial data loss: all transactions logged before acknowledged
- **RNF-11:** Ledger integrity: all entries are immutable once recorded

### 6.3 Security & Compliance
- **RNF-12:** All financial data encrypted at rest and in transit
- **RNF-13:** Financial decision audit trail is immutable and tamper-evident
- **RNF-14:** Access control: agents can only query their own metrics (not other agents')
- **RNF-15:** All external financial integrations use secure credential storage
- **RNF-16:** PCI/SOX compliance for sensitive financial operations
- **RNF-17:** Rate limiting on financial query APIs (max 100 req/sec per agent)

### 6.4 Scalability
- **RNF-18:** Support 10,000+ agents operating simultaneously
- **RNF-19:** Ledger supports 1M+ transactions per day
- **RNF-20:** Constraint evaluation scales linearly with number of constraints (O(n) where n = constraints)
- **RNF-21:** Forecasting algorithms scale sublinearly with time horizon

### 6.5 Maintainability
- **RNF-22:** All financial calculations must be transparent and auditable
- **RNF-23:** Constraint definitions are version-controlled and support rollback
- **RNF-24:** Financial integrations must be pluggable (support adding new data sources)
- **RNF-25:** Cash flow engine must be independently testable

---

## 7. Architecture & Design

### 7.1 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agent Runtime                             │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Agent Execution Engine                       │   │
│  │  - Action dispatch                                        │   │
│  │  - Hooks: onBeforeAction, onDuringAction, onAfterAction │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                       │
│  ┌────────────────────────▼─────────────────────────────────┐   │
│  │        Cash Flow Control Module (NEW)                    │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │ 1. Cash Position Manager                         │   │   │
│  │  │    - Aggregates financial data sources           │   │   │
│  │  │    - Computes metrics in real-time               │   │   │
│  │  │    - Caches with TTL                             │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │                                                          │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │ 2. Constraint Engine                             │   │   │
│  │  │    - Evaluates constraints for each action       │   │   │
│  │  │    - Determines if action is allowed             │   │   │
│  │  │    - Prioritizes actions if resources limited    │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │                                                          │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │ 3. Cost Tracking & Ledger                        │   │   │
│  │  │    - Tracks estimated vs actual costs            │   │   │
│  │  │    - Immutable ledger for all transactions       │   │   │
│  │  │    - Async updates to not block execution        │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │                                                          │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │ 4. Emergency Protocol Manager                    │   │   │
│  │  │    - Activates/deactivates emergency constraints │   │   │
│  │  │    - Broadcasts constraint updates               │   │   │
│  │  │    - Implements graceful degradation             │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │                                                          │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │ 5. Forecast & Analysis Engine                    │   │   │
│  │  │    - Predicts future cash position               │   │   │
│  │  │    - Detects anomalies                           │   │   │
│  │  │    - Provides optimization recommendations       │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │                                                          │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │ 6. Agent Interface Layer                         │   │   │
│  │  │    - Provides agent tools and APIs               │   │   │
│  │  │    - Sends notifications                         │   │   │
│  │  │    - Formats recommendations                     │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Database Layer                                │  │
│  │  - Constraints table                                       │  │
│  │  - Financial ledger table                                  │  │
│  │  - Cost tracking table                                     │  │
│  │  - Emergency protocol log                                  │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
        │                                         │
        │                                         │
┌───────▼──────────────────────┐  ┌──────────────▼────────────────┐
│  Financial Data Integrations  │  │  Agent Role/Permission System │
│                               │  │                               │
│ - Bank APIs (Stripe, Plaid)  │  │ - Constraint templates by role │
│ - Accounting (QB, Xero)      │  │ - Spend limits per role       │
│ - Payment processors         │  │ - Approval workflows          │
│ - Custom webhooks            │  │                               │
└───────────────────────────────┘  └───────────────────────────────┘
```

### 7.2 Data Model

#### Cash Flow Constraints Table
```sql
CREATE TABLE cash_flow_constraints (
  id TEXT PRIMARY KEY,                       -- uuid
  constraint_type TEXT NOT NULL,             -- 'hard_limit', 'soft_limit', 'quota', 'percentage'

  -- Scope
  organization_id TEXT,                      -- null = global constraint
  agent_id TEXT,                             -- null = applies to agent type/role
  agent_type TEXT,                           -- null = applies to all agents
  agent_role TEXT,                           -- null = applies to all roles
  action_type TEXT,                          -- null = applies to all action types

  -- Constraint definition
  limit_value DECIMAL(15,2) NOT NULL,        -- amount or percentage
  currency TEXT DEFAULT 'USD',
  period TEXT NOT NULL,                      -- 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'total'

  -- Scheduling
  active BOOLEAN DEFAULT true,
  scheduled_activation TIMESTAMP,            -- when to activate (if scheduled)
  scheduled_deactivation TIMESTAMP,          -- when to deactivate
  severity TEXT,                             -- 'warning', 'yellow', 'red', 'critical'

  -- Metadata
  description TEXT,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_org_id (organization_id),
  INDEX idx_agent_id (agent_id),
  INDEX idx_active (active)
);
```

#### Financial Ledger Table
```sql
CREATE TABLE financial_ledger (
  id TEXT PRIMARY KEY,                       -- uuid

  -- Transaction identification
  agent_id TEXT NOT NULL,
  action_id TEXT NOT NULL,                   -- References agent action
  action_type TEXT NOT NULL,

  -- Cost information
  estimated_cost DECIMAL(15,2) NOT NULL,
  actual_cost DECIMAL(15,2),                 -- null until actual is known
  currency TEXT DEFAULT 'USD',

  -- Context
  constraints_applied TEXT,                  -- JSON array of constraint IDs that applied
  decision TEXT NOT NULL,                    -- 'approved', 'denied', 'queued', 'constrained'
  decision_reason TEXT,
  cash_position_at_decision DECIMAL(15,2),   -- for audit trail

  -- Metadata
  expected_return DECIMAL(15,2),
  actual_return DECIMAL(15,2),
  roi_percentage DECIMAL(5,2),               -- calculated after completion

  status TEXT,                               -- 'pending', 'in_progress', 'completed', 'failed'
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_agent_id (agent_id),
  INDEX idx_created_at (created_at),
  INDEX idx_decision (decision),
  INDEX idx_action_type (action_type)
);
```

#### Cost Tracking Table
```sql
CREATE TABLE cost_tracking (
  id TEXT PRIMARY KEY,                       -- uuid
  ledger_entry_id TEXT NOT NULL REFERENCES financial_ledger(id),

  agent_id TEXT NOT NULL,
  checkpoint TEXT NOT NULL,                  -- 'before_action', 'during_action', 'after_action'

  -- Cost metrics
  cumulative_cost DECIMAL(15,2),
  interval_cost DECIMAL(15,2),               -- cost since last checkpoint
  variance_percentage DECIMAL(5,2),          -- (actual - estimated) / estimated

  metrics_snapshot TEXT,                     -- JSON with cash position, burn rate, etc at this point

  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_ledger_entry_id (ledger_entry_id),
  INDEX idx_agent_id (agent_id)
);
```

#### Cash Position Cache Table
```sql
CREATE TABLE cash_position_cache (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,

  -- Aggregated position
  total_cash DECIMAL(15,2) NOT NULL,
  reserved_cash DECIMAL(15,2),               -- held for committed expenses
  available_cash DECIMAL(15,2) GENERATED ALWAYS AS (total_cash - reserved_cash),

  -- Metrics
  daily_burn_rate DECIMAL(15,2),
  hourly_burn_rate DECIMAL(15,2),
  runway_days DECIMAL(8,2),                  -- days until cash depleted

  -- Source metadata
  primary_source TEXT,                       -- which data source provided the balance
  data_freshness_seconds INTEGER,            -- how fresh is this data
  last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  next_refresh TIMESTAMP,

  -- For forecasting
  forecast_data TEXT,                        -- JSON with 30-day forecast

  INDEX idx_org_id (organization_id),
  UNIQUE(organization_id)
);
```

#### Emergency Protocol Log
```sql
CREATE TABLE emergency_protocol_log (
  id TEXT PRIMARY KEY,                       -- uuid
  organization_id TEXT NOT NULL,

  action TEXT NOT NULL,                      -- 'activated', 'deactivated', 'escalated', 'relaxed'
  severity TEXT,                             -- 'warning', 'yellow', 'red', 'critical'

  triggered_by TEXT,                         -- 'automatic', 'manual'
  triggered_by_user TEXT,                    -- user who triggered if manual

  -- Conditions at time of action
  cash_position DECIMAL(15,2),
  burn_rate DECIMAL(15,2),
  runway_days DECIMAL(8,2),
  threshold_that_triggered DECIMAL(15,2),   -- the threshold that was crossed

  -- Actions taken
  constraints_activated TEXT,                -- JSON array of constraint IDs
  agents_notified INTEGER,                   -- count of agents notified
  actions_queued INTEGER,                    -- count of actions queued due to constraints

  duration_minutes INTEGER,                  -- how long emergency lasted (if deactivated)

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deactivated_at TIMESTAMP,

  INDEX idx_org_id (organization_id),
  INDEX idx_severity (severity),
  INDEX idx_created_at (created_at)
);
```

### 7.3 Component Details

#### 7.3.1 Cash Position Manager
```typescript
// packages/mastra-engine/src/cash-flow/cash-position-manager.ts

interface CashPosition {
  totalCash: number;
  reservedCash: number;
  availableCash: number;
  currency: string;
  freshness: { sourceId: string; ageSeconds: number };
}

interface CashMetrics {
  cashPosition: CashPosition;
  dailyBurnRate: number;
  hourlyBurnRate: number;
  runwayDays: number;
  lastUpdated: Date;
}

class CashPositionManager {
  // Aggregate cash from multiple sources with fallback
  async getCurrentCashPosition(): Promise<CashPosition>;

  // Compute derived metrics
  async getMetrics(): Promise<CashMetrics>;

  // Cache with TTL and invalidation
  private metricCache: Map<string, CachedMetric>;

  // Handle data source failures gracefully
  async fetchFromSourceWithFallback(sourceId: string): Promise<number>;
}
```

#### 7.3.2 Constraint Engine
```typescript
// packages/mastra-engine/src/cash-flow/constraint-engine.ts

interface Constraint {
  id: string;
  type: 'hard_limit' | 'soft_limit' | 'quota' | 'percentage';
  limitValue: number;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  scope: { agentId?: string; agentType?: string; actionType?: string };
  severity?: 'warning' | 'yellow' | 'red' | 'critical';
  active: boolean;
}

interface ActionEvaluation {
  allowed: boolean;
  reason?: string;
  constraintContext: {
    availableBudget: number;
    dailyLimit: number;
    consumed: number;
    percentageUsed: number;
  };
  alternatives?: {
    cost: number;
    benefit: string;
    description: string;
  }[];
  recommendation?: string;
}

class ConstraintEngine {
  // Main evaluation function
  async evaluateAction(
    agentId: string,
    action: AgentAction
  ): Promise<ActionEvaluation>;

  // Get applicable constraints for agent
  async getApplicableConstraints(agentId: string): Promise<Constraint[]>;

  // Check if action violates constraints
  private checkConstraintViolation(
    constraint: Constraint,
    agentId: string,
    cost: number,
    currentSpent: number
  ): boolean;

  // Generate alternative recommendations
  private generateAlternatives(
    agentId: string,
    requestedCost: number,
    availableBudget: number
  ): ActionAlternative[];
}
```

#### 7.3.3 Cost Tracking & Ledger
```typescript
// packages/mastra-engine/src/cash-flow/ledger.ts

interface LedgerEntry {
  id: string;
  agentId: string;
  actionId: string;
  actionType: string;
  estimatedCost: number;
  actualCost?: number;
  decision: 'approved' | 'denied' | 'queued' | 'constrained';
  decisionReason?: string;
  constraintsApplied: string[];
  cashPositionAtDecision: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  expectedReturn?: number;
  actualReturn?: number;
  createdAt: Date;
  completedAt?: Date;
}

class FinancialLedger {
  // Record action in immutable ledger
  async recordAction(entry: LedgerEntry): Promise<void>;

  // Track cost checkpoint (before/during/after action)
  async recordCostCheckpoint(
    ledgerId: string,
    checkpoint: 'before_action' | 'during_action' | 'after_action',
    actualCost: number,
    metrics: CashMetrics
  ): Promise<void>;

  // Query ledger
  async getEntries(
    filters: { agentId?: string; dateRange?: [Date, Date]; actionType?: string }
  ): Promise<LedgerEntry[]>;

  // Reconcile estimated vs actual
  async reconcileEntry(ledgerId: string, actualCost: number): Promise<void>;

  // Audit functions
  async getAuditTrail(agentId: string): Promise<AuditEntry[]>;
}
```

#### 7.3.4 Emergency Protocol Manager
```typescript
// packages/mastra-engine/src/cash-flow/emergency-protocol.ts

type EmergencySeverity = 'warning' | 'yellow' | 'red' | 'critical';

interface EmergencyProtocolConfig {
  enabled: boolean;
  thresholds: {
    warning: number;      // % of monthly burn
    yellow: number;
    red: number;
    critical: number;
  };
  actions: {
    [key in EmergencySeverity]: EmergencyAction[];
  };
}

interface EmergencyAction {
  type: 'degrade_non_essential' | 'queue_all_non_essential' | 'notify_admins';
  params?: Record<string, any>;
}

class EmergencyProtocolManager {
  // Check if emergency should be triggered
  async checkAndActivateEmergency(): Promise<void>;

  // Manual activation
  async activateEmergency(severity: EmergencySeverity, reason?: string): Promise<void>;

  // Deactivation
  async deactivateEmergency(): Promise<void>;

  // Broadcast updates to agents
  private async broadcastConstraintUpdate(constraints: Constraint[]): Promise<void>;

  // Apply emergency actions (e.g., queue non-essential actions)
  private async applyEmergencyActions(severity: EmergencySeverity): Promise<void>;
}
```

#### 7.3.5 Forecast & Analysis Engine
```typescript
// packages/mastra-engine/src/cash-flow/forecast.ts

interface DailyForecast {
  date: Date;
  projectedCashPosition: number;
  projectedBurnRate: number;
  confidence: number;  // 0-1
  factors: { type: string; impact: number }[];
}

interface Forecast {
  generatedAt: Date;
  days: DailyForecast[];
  alerts: { date: Date; type: 'yellow_flag' | 'red_flag'; reason: string }[];
}

class ForecastEngine {
  // Generate forecast for N days
  async forecastCashFlow(days: number): Promise<Forecast>;

  // Analyze trends
  async analyzeTrends(
    period: 'last_7_days' | 'last_30_days' | 'last_90_days'
  ): Promise<TrendAnalysis>;

  // Detect anomalies
  async detectAnomalies(period: string): Promise<Anomaly[]>;

  // Optimize resource allocation
  async optimizeResourceAllocation(
    agents: AgentWithProjection[]
  ): Promise<AllocationPlan>;

  // Historical learning
  private forecastModel: TimeSeriesModel;
}
```

---

## 8. Implementation Plan

### Phase 1: Foundation (Weeks 1-2)
- [x] Design data schema and database tables
- [x] Implement CashPositionManager with single data source
- [ ] Integrate with Stripe API for initial testing
- [ ] Create ConstraintEngine basic functionality
- [ ] Build basic ledger tracking

### Phase 2: Core Functionality (Weeks 2-3)
- [ ] Complete ConstraintEngine with multi-source constraints
- [ ] Implement action evaluation pipeline
- [ ] Build cost tracking and reconciliation
- [ ] Create emergency protocol manager
- [ ] Integrate into agent execution engine hooks

### Phase 3: Agent Integration (Weeks 3-4)
- [ ] Implement agent-facing API tools
- [ ] Build notification system
- [ ] Create recommendation engine
- [ ] Add memory integration
- [ ] Create CLI commands for finance admins

### Phase 4: Advanced Features (Weeks 4-5)
- [ ] Implement forecast engine
- [ ] Build optimization algorithms
- [ ] Create multi-agent resource allocation
- [ ] Add anomaly detection

### Phase 5: Integration & Testing (Weeks 5-7)
- [ ] Integration with role/permission system
- [ ] Comprehensive testing and benchmarking
- [ ] Performance optimization
- [ ] Documentation and examples
- [ ] Staged rollout with monitoring

---

## 9. API & Implementation Contract

### Agent-Facing API
```typescript
// packages/mastra-engine/src/agent/tools/cash-flow.ts

interface CashFlowTools {
  // Query current status
  async getCashFlowStatus(): Promise<{
    totalCash: number;
    availableCash: number;
    dailyBurnRate: number;
    runwayDays: number;
    currency: string;
    lastUpdated: Date;
  }>;

  // Get personalized guidance
  async getSpendingRecommendations(context: {
    intendedAction: string;
    estimatedCost: number;
    expectedReturn?: number;
  }): Promise<Recommendation[]>;

  // Evaluate action feasibility
  async evaluateAction(action: {
    type: string;
    estimatedCost: number;
    expectedReturn?: number;
    duration?: string;
  }): Promise<ActionEvaluation>;

  // Query forecasts
  async getForecastedCashFlowTrend(days: number): Promise<Forecast>;

  // Get constraints
  async getApplicableConstraints(): Promise<{
    constraints: Constraint[];
    totalLimitPerDay: number;
    consumedToday: number;
    percentageUsed: number;
  }>;

  // Request budget allocation
  async requestBudgetAllocation(request: {
    amount: number;
    justification: string;
    priority: 'low' | 'medium' | 'high';
  }): Promise<AllocationResult>;

  // Query spending
  async getMySpendingMetrics(period: {
    from: Date;
    to: Date;
    breakdown?: 'by_day' | 'by_action_type' | 'by_decision';
  }): Promise<SpendingMetrics>;
}

// Register as agent tool
registerTool('cash_flow', new CashFlowTools());
```

### Admin & System API
```typescript
// packages/mastra-engine/src/cash-flow/admin-api.ts

interface CashFlowAdminAPI {
  // Constraint management
  async createConstraint(constraint: ConstraintDefinition): Promise<Constraint>;
  async updateConstraint(id: string, updates: Partial<Constraint>): Promise<void>;
  async deleteConstraint(id: string): Promise<void>;
  async listConstraints(filters?: ConstraintFilters): Promise<Constraint[]>;

  // Emergency protocols
  async activateEmergency(severity: EmergencySeverity, reason?: string): Promise<void>;
  async deactivateEmergency(): Promise<void>;
  async getEmergencyStatus(): Promise<EmergencyStatus>;

  // Reporting
  async generateCostReport(period: DateRange, groupBy?: string[]): Promise<CostReport>;
  async generateConstraintImpactReport(period: DateRange): Promise<ConstraintImpactReport>;
  async generateAuditLog(filters?: AuditLogFilters): Promise<AuditEntry[]>;

  // Data source management
  async registerDataSource(source: DataSourceConfig): Promise<void>;
  async testDataSourceConnection(sourceId: string): Promise<boolean>;
  async getDataSourceStatus(): Promise<DataSourceStatus[]>;

  // Manual overrides
  async overrideConstraint(
    agentId: string,
    actionId: string,
    reason: string
  ): Promise<void>;
}
```

---

## 10. Integration Points

### Integration with Agent Execution Engine
The cash flow system integrates via hooks in the agent action execution pipeline:

```typescript
// Before action execution
await cashFlowEngine.onBeforeAction({
  agentId: agent.id,
  actionId: action.id,
  actionType: action.type,
  estimatedCost: action.estimatedCost
});

// During action execution
await cashFlowEngine.onDuringAction({
  actionId: action.id,
  currentCost: actualCostSoFar,
  expectedCompletion: estimatedTimeRemaining
});

// After action execution
await cashFlowEngine.onAfterAction({
  actionId: action.id,
  actualCost: finalActualCost,
  actualReturn: revenue || outcome,
  status: 'completed' | 'failed'
});
```

### Integration with Role/Permission System
- Link constraints to roles (e.g., "research_agent" role has different limits than "sales_agent")
- Support constraint inheritance and overrides
- Check permissions before allowing admin operations

### Integration with Memory System
- Store spending patterns in agent memory
- Use memory to improve recommendations
- Track constraint compliance history

### Integration with Communication Providers
- Notify agents of constraint changes via their communication channels
- Send alerts when spending limits are approached
- Support constraint notifications in native provider formats

---

## 11. Error Handling & Edge Cases

### Error Scenarios

| Scenario | Action | Recovery |
|---|---|---|
| **Financial data source unavailable** | Use cached data (up to 5 min old) | Retry with exponential backoff |
| **Cost actual significantly exceeds estimate** | Log deviation, escalate action | Adjust future estimates |
| **Multiple agents competing for limited budget** | Fair queue with priority | Process in queue order |
| **Forecast data is stale** | Use previous forecast | Regenerate forecast |
| **Emergency protocol conflicts with permissions** | Emergency takes precedence | Log override |
| **Constraint evaluation timeout** | Default to deny (fail safe) | Alert operator |
| **Ledger write fails** | Queue for retry (async) | Alert operator if persistent |

### Edge Cases
- Agents with $0 budget: allow only essential operations
- Multiple simultaneous constraint changes: use atomic updates
- Retroactive cost adjustments: support correction within 24 hours
- Currency conversion: use real-time rates with fallback
- Overlapping constraints: use most restrictive

---

## 12. Testing & Validation

### Unit Tests
- Cash position calculation from multiple sources
- Constraint evaluation logic
- Cost reconciliation
- Forecast accuracy
- Emergency protocol triggering

### Integration Tests
- End-to-end action evaluation and execution
- Multiple agents competing for budget
- Constraint enforcement during concurrent operations
- Data source failover
- Emergency protocol activation and agent notification

### Performance Tests
- Cash flow query latency (target: < 100ms)
- Concurrent constraint evaluations (1000+ agents)
- Ledger write throughput (1M+ tx/day)
- Forecast generation (< 500ms for 90 days)

### Scenario Tests
- Cash crisis scenario (major revenue delayed)
- Budget overrun scenario (multiple agents exceeding limits)
- Data source outage (multiple sources down)
- Forecast accuracy validation (compare predictions to actuals over time)

---

## 13. Success Metrics & Monitoring

### Key Performance Indicators

| Metric | Target | Threshold |
|---|---|---|
| **Constraint enforcement accuracy** | 100% | Alert if < 99.99% |
| **Cash flow query latency (p99)** | < 100ms | Alert if > 200ms |
| **Emergency protocol activation time** | < 5 min | Alert if > 10 min |
| **Ledger write success rate** | 99.9% | Alert if < 99% |
| **Forecast accuracy** | ±15% | Alert if > ±25% |
| **Agent action approval rate** | Baseline | Alert if unusual change |
| **Budget constraint violations** | 0 | Alert on any violation |
| **Data source availability** | 99.9% | Alert if < 99% |

### Monitoring & Alerting
```sql
-- Query active constraints
SELECT COUNT(*) as active_constraints FROM cash_flow_constraints WHERE active = true;

-- Track constraint violations (should be zero)
SELECT COUNT(*) as violations FROM financial_ledger
WHERE decision = 'denied' AND created_at > NOW() - INTERVAL 1 HOUR;

-- Monitor data freshness
SELECT source_id, age_seconds FROM cash_position_cache
WHERE age_seconds > 300;

-- Alert on low cash position
SELECT cash_position FROM cash_position_cache
WHERE available_cash < total_cash * 0.05;  -- < 5% runway

-- Track constraint effectiveness
SELECT
  constraint_type,
  COUNT(*) as times_applied,
  COUNT(CASE WHEN decision = 'denied' THEN 1 END) as actions_blocked
FROM financial_ledger fl
JOIN constraints c ON fl.constraints_applied LIKE '%' || c.id || '%'
GROUP BY constraint_type;
```

### Dashboards
- Real-time cash position and runway
- Constraint effectiveness (how many actions blocked vs. allowed)
- Cost attribution by agent and action type
- Emergency protocol timeline
- Forecast accuracy tracking
- Budget vs. actual spending trends

---

## 14. Future Enhancements

1. **Advanced Forecasting:** Machine learning models incorporating external factors (market conditions, seasonality)
2. **Predictive Constraint Optimization:** Automatically adjust constraints based on forecast and ROI
3. **Multi-Currency Support:** Full support for multi-currency operations with real-time conversion
4. **Cost Allocation Models:** Support for complex allocation (shared costs, overhead distribution)
5. **Budget Variance Analysis:** Deep analysis of why actual differs from forecast
6. **Cost Optimization AI:** Agent that recommends cost reduction strategies
7. **External Integration:** Sync with external financial systems (SAP, NetSuite, etc.)
8. **Blockchain Audit Trail:** Immutable ledger using blockchain for regulatory compliance
9. **Scenario Modeling:** What-if analysis for different constraint policies
10. **Behavioral Economics:** Agent learning based on constraint patterns and outcomes

---

## 15. Glossary

- **Cash Flow:** Movement of money in and out of the organization
- **Burn Rate:** Rate at which organization spends money (per day or hour)
- **Runway:** Number of days organization can operate at current burn rate with available cash
- **Constraint:** Rule that limits financial action (hard limit, soft limit, quota)
- **Emergency Protocol:** Automated response to critical cash flow situation
- **Ledger:** Immutable record of all financial decisions and transactions
- **Forecast:** Predicted cash position for future time period
- **ROI:** Return on Investment (revenue / cost)
- **Constraint Evaluation:** Process of determining if action is allowed given constraints
- **Cost Reconciliation:** Matching estimated cost against actual cost after action completes

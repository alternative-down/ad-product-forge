export type AdminFinance = {
  balanceUsd: number;
  summary: {
    periodStart: number;
    periodEnd: number;
    totalInUsd: number;
    totalOutUsd: number;
    netUsd: number;
    balanceUsd: number;
    scheduledInUsd: number;
    scheduledOutUsd: number;
  };
  movements: {
    items: Array<{
      id: string;
      type: string;
      direction: 'in' | 'out';
      amountUsd: number;
      description?: string;
      status: string;
      dueAt?: number;
      effectiveAt?: number;
      createdAt: number;
    }>;
    total: number;
  };
  recurringPayables: Array<{
    payableId: string;
    name: string;
    description?: string;
    amountUsd: number;
    recurrencePeriod: 'weekly' | 'monthly' | 'yearly';
    nextDueAt: number;
    isActive: boolean;
    createdAt: number;
    updatedAt: number;
  }>;
};

export type CreateInvestmentInput = {
  amountUsd: number;
  description?: string;
  effectiveAt?: string;
};

export type CreatePayableInput =
  | {
      kind: 'single';
      name: string;
      description?: string;
      amountUsd: number;
      dueAt: string;
    }
  | {
      kind: 'recurring';
      name: string;
      description?: string;
      amountUsd: number;
      dueAt: string;
      recurrencePeriod: 'weekly' | 'monthly' | 'yearly';
    };

export type FinanceContractsResponse = {
  items: Array<{
    contractId: string;
    agentId: string;
    agentName: string;
    startsAt: number;
    endsAt: number;
    weeklyValueUsd: number;
    spentUsd: number;
    spentPercent: number;
    autoRenew: boolean;
  }>;
};

export type TopUpAgentContractInput = {
  agentId: string;
  amountUsd: number;
};

export type AdjustAgentContractBudgetInput = {
  agentId: string;
  newBudgetUsd: number;
};

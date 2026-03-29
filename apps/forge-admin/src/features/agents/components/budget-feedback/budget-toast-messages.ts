// Budget Toast Constants and Utilities

export type BudgetToastVariant = 'success' | 'warning' | 'error' | 'info';

export interface BudgetToastProps {
  id: string;
  variant: BudgetToastVariant;
  title: string;
  description?: string;
  budgetInfo?: {
    previousBudget: number;
    newBudget: number;
    amount?: number;
  };
  duration?: number;
  onDismiss?: (id: string) => void;
}

export function createBudgetToast(
  variant: BudgetToastVariant,
  title: string,
  options?: {
    description?: string;
    previousBudget?: number;
    newBudget?: number;
    amount?: number;
  }
) {
  return {
    id: `budget-toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    variant,
    title,
    description: options?.description,
    budgetInfo: options?.previousBudget && options.newBudget
      ? {
          previousBudget: options.previousBudget,
          newBudget: options.newBudget,
          amount: options.amount,
        }
      : undefined,
  };
}

export const BUDGET_TOAST_MESSAGES = {
  topUpSuccess: (amount: number) => ({
    title: 'Top-up realizado!',
    description: `$${amount.toFixed(2)} adicionados ao budget.`,
  }),
  topUpError: {
    title: 'Falha no top-up',
    description: 'Não foi possível adicionar funds. Tente novamente.',
  },
  adjustSuccess: (newBudget: number, previousBudget: number) => ({
    title: 'Budget atualizado!',
    description: `De $${previousBudget.toFixed(2)} → $${newBudget.toFixed(2)}`,
  }),
  adjustError: {
    title: 'Falha ao ajustar budget',
    description: 'Verifique os valores e tente novamente.',
  },
  budgetWarning: (percentage: number) => ({
    title: 'Budget baixo!',
    description: `Budget a ${percentage}% — considere fazer top-up.`,
  }),
  budgetCritical: () => ({
    title: 'Budget quase esgotado!',
    description: 'Agent vai parar em breve. Faça top-up agora.',
  }),
};

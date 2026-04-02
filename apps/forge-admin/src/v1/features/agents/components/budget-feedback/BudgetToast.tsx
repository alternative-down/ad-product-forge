// Budget Toast Component
// Placeholder kept while toast behavior remains unimplemented in the admin app.

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

// Placeholder - toast functionality not implemented
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function BudgetToast(_props: BudgetToastProps) {
  return null;
}

export function BudgetToastProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

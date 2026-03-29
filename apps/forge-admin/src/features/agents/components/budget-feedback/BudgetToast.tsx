// Budget Toast Component
// DEPRECATED: Toast components from @forge/ui not available
// This is a placeholder to maintain backwards compatibility

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

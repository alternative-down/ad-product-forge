'use client';

import { cn } from '@forge/ui';
import { AlertTriangle, AlertCircle } from 'lucide-react';

export type BudgetState = 'empty' | 'loading' | 'error' | 'normal' | 'caution' | 'warning' | 'critical' | 'over';

export interface BudgetProgressCardProps {
  /** Current budget spent amount in USD */
  budgetUsed: number;
  /** Budget limit in USD */
  budgetLimit: number;
  /** Budget period label (e.g., "por semana", "por mês") */
  periodLabel?: string;
  /** Loading state */
  isLoading?: boolean;
  /** Error state with retry callback */
  error?: string | null;
  onRetry?: () => void;
  /** Custom class */
  className?: string;
}

function getBudgetState(budgetUsed: number, budgetLimit: number): BudgetState {
  if (budgetLimit === 0) return 'empty';
  const percentage = (budgetUsed / budgetLimit) * 100;
  if (percentage < 50) return 'normal';
  if (percentage < 75) return 'caution';
  if (percentage < 90) return 'warning';
  if (percentage <= 100) return 'critical';
  return 'over';
}

function getStateStyles(state: BudgetState) {
  switch (state) {
    case 'empty':
      return {
        bar: 'bg-slate-200',
        container: 'border-slate-200',
        text: 'text-slate-500',
        badge: null,
      };
    case 'warning':
      return {
        bar: 'bg-orange-500',
        container: 'border-orange-300 bg-orange-50',
        text: 'text-orange-700',
        badge: { icon: AlertTriangle, className: 'text-orange-500', label: 'Atenção' },
      };
    case 'critical':
      return {
        bar: 'bg-red-500',
        container: 'border-red-300 bg-red-50',
        text: 'text-red-700',
        badge: { icon: AlertCircle, className: 'text-red-500', label: 'Crítico' },
      };
    case 'over':
      return {
        bar: 'bg-red-800 animate-stripes',
        container: 'border-red-400 bg-red-100',
        text: 'text-red-800',
        badge: { icon: AlertCircle, className: 'text-red-600', label: 'Excedido' },
      };
    case 'loading':
      return {
        bar: 'bg-slate-300 animate-pulse',
        container: 'border-slate-200',
        text: 'text-slate-400',
        badge: null,
      };
    case 'error':
      return {
        bar: 'bg-red-300',
        container: 'border-red-200',
        text: 'text-red-500',
        badge: null,
      };
    default:
      return {
        bar: 'bg-green-500',
        container: 'border-green-200 bg-green-50',
        text: 'text-green-700',
        badge: null,
      };
  }
}

export function BudgetProgressCard({
  budgetUsed,
  budgetLimit,
  periodLabel = 'por semana',
  isLoading,
  error,
  onRetry,
  className,
}: BudgetProgressCardProps) {
  if (isLoading) {
    return (
      <div className={cn('rounded-lg border bg-card p-4 shadow-sm', className)}>
        <div className="space-y-3">
          <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
          <div className="h-2 w-full animate-pulse rounded bg-slate-200" />
          <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border bg-card p-4 shadow-sm', className)}>
        <p className="text-sm text-red-600">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 text-sm text-blue-600 hover:underline"
          >
            Tentar novamente
          </button>
        )}
      </div>
    );
  }

  const state = getBudgetState(budgetUsed, budgetLimit);
  const styles = getStateStyles(state);
  const percentage = budgetLimit > 0 ? Math.min((budgetUsed / budgetLimit) * 100, 100) : 0;
  const isOver = budgetUsed > budgetLimit;

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 shadow-sm transition-colors',
        styles.container,
        className
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">Budget {periodLabel}</span>
        {styles.badge && (
          <span className={cn('flex items-center gap-1 text-xs font-medium', styles.badge.className)}>
            <styles.badge.icon className="h-3 w-3" />
            {styles.badge.label}
          </span>
        )}
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            styles.bar,
            state === 'over' && 'bg-[length:8px_8px] bg-[linear-gradient(135deg,#991b1b_25%,transparent_25%,transparent_50%,#991b1b_50%,#991b1b_75%,transparent_75%)] animate-[stripes_1s_linear_infinite]'
          )}
          style={{ width: `${percentage}%` }}
        />
        {isOver && (
          <div
            className="absolute right-0 top-0 h-full bg-red-800 opacity-50"
            style={{ width: `${Math.min(((budgetUsed - budgetLimit) / budgetLimit) * 100, 100)}%` }}
          />
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <span className={cn('text-lg font-semibold', styles.text)}>
          ${budgetUsed.toFixed(2)}
        </span>
        <span className="text-sm text-slate-500">
          de ${budgetLimit.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

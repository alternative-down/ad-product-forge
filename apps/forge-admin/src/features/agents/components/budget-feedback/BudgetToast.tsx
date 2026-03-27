'use client';

import React from 'react';
import { cn } from '@forge/ui';
import { AlertTriangle, AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from '@forge/ui';

export type BudgetToastVariant = 'success' | 'warning' | 'error' | 'info';

export interface BudgetToastProps {
  /** Toast unique ID */
  id: string;
  /** Toast variant */
  variant: BudgetToastVariant;
  /** Toast title */
  title: string;
  /** Toast description */
  description?: string;
  /** Additional budget-specific info */
  budgetInfo?: {
    previousBudget: number;
    newBudget: number;
    amount?: number;
  };
  /** Auto-dismiss duration in ms (default: 3000 for success, persistent for error/warning) */
  duration?: number;
  /** Callback when toast is dismissed */
  onDismiss?: (id: string) => void;
}

const variantConfig = {
  success: {
    icon: CheckCircle,
    className: 'border-green-200 bg-green-50',
    iconClassName: 'text-green-600',
    titleClassName: 'text-green-800',
    descClassName: 'text-green-700',
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-orange-200 bg-orange-50',
    iconClassName: 'text-orange-600',
    titleClassName: 'text-orange-800',
    descClassName: 'text-orange-700',
  },
  error: {
    icon: AlertCircle,
    className: 'border-red-200 bg-red-50',
    iconClassName: 'text-red-600',
    titleClassName: 'text-red-800',
    descClassName: 'text-red-700',
  },
  info: {
    icon: Info,
    className: 'border-blue-200 bg-blue-50',
    iconClassName: 'text-blue-600',
    titleClassName: 'text-blue-800',
    descClassName: 'text-blue-700',
  },
};

export function BudgetToast({
  id,
  variant,
  title,
  description,
  budgetInfo,
  duration,
  onDismiss,
}: BudgetToastProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;
  
  // Error and warning toasts persist by default
  const autoCloseDuration = duration ?? (variant === 'success' ? 3000 : undefined);

  return (
    <Toast
      className={cn('border-l-4 shadow-md', config.className)}
      duration={autoCloseDuration}
      onOpenChange={(open) => {
        if (!open && onDismiss) {
          onDismiss(id);
        }
      }}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', config.iconClassName)} />
        <div className="flex-1 space-y-1">
          <ToastTitle className={cn('text-sm font-semibold', config.titleClassName)}>
            {title}
          </ToastTitle>
          {description && (
            <ToastDescription className={cn('text-sm', config.descClassName)}>
              {description}
            </ToastDescription>
          )}
          {budgetInfo && (
            <div className="mt-2 rounded bg-white/50 p-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Budget anterior:</span>
                <span className="font-medium">${budgetInfo.previousBudget.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Novo budget:</span>
                <span className="font-medium text-green-600">${budgetInfo.newBudget.toFixed(2)}</span>
              </div>
              {budgetInfo.amount && (
                <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
                  <span className="text-slate-500">Adicionado:</span>
                  <span className="font-medium text-green-600">+${budgetInfo.amount.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}
        </div>
        <ToastClose className="text-slate-400 hover:text-slate-600" />
      </div>
    </Toast>
  );
}

// Convenience function to create budget toast data
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

// Default budget toast messages (from Toast-Patterns.md)
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
    description: `Novo budget: $${newBudget.toFixed(2)}`,
  }),
  adjustError: {
    title: 'Falha ao ajustar budget',
    description: 'Verifique os valores e tente novamente.',
  },
  budgetWarning: (percentage: number) => ({
    title: '⚠️ Budget em atenção',
    description: `Você já usou ${percentage.toFixed(0)}% do budget. Considere fazer um top-up.`,
  }),
  budgetCritical: (percentage: number) => ({
    title: '🚨 Budget crítico',
    description: `Você já usou ${percentage.toFixed(0)}% do budget. Ação necessária!`,
  }),
  budgetExceeded: () => ({
    title: 'Budget excedido',
    description: 'Agent parado por budget. Faça um top-up para continuar.',
  }),
};

// Toast Provider wrapper for budget toasts
export function BudgetToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <ToastViewport />
    </ToastProvider>
  );
}

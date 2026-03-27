'use client';

import React, { useState } from 'react';
import { cn } from '@forge/ui';
import { AlertCircle, ChevronDown, ChevronUp, Loader2, Minus, Plus } from 'lucide-react';
import { Button } from '@forge/ui';
import { Input } from '@forge/ui';
import { Label } from '@forge/ui';

export interface BudgetAdjustCardProps {
  /** Current budget amount */
  currentBudget: number;
  /** Current budget spent */
  budgetSpent: number;
  /** Minimum allowed budget */
  minBudget?: number;
  /** Whether decrease is allowed */
  canDecrease?: boolean;
  /** Callback when adjustment is confirmed */
  onAdjust: (newBudget: number) => Promise<void>;
  /** Loading state */
  isLoading?: boolean;
  /** Custom class */
  className?: string;
}

const PRESET_ADJUSTMENTS = [
  { delta: 10, label: '+$10' },
  { delta: 25, label: '+$25' },
  { delta: 50, label: '+$50' },
  { delta: -10, label: '-$10' },
  { delta: -25, label: '-$25' },
];

export function BudgetAdjustCard({
  currentBudget,
  budgetSpent,
  minBudget = 5,
  canDecrease = false,
  onAdjust,
  className,
}: BudgetAdjustCardProps) {
  const [customBudget, setCustomBudget] = useState(currentBudget.toString());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const newBudget = parseFloat(customBudget) || 0;
  const isDecrease = newBudget < currentBudget;
  const isInvalid = newBudget < minBudget;
  const exceedsSpent = newBudget < budgetSpent;

  // Quick adjustment handlers
  const handleQuickAdjust = (delta: number) => {
    const newValue = Math.max(minBudget, currentBudget + delta);
    setCustomBudget(newValue.toFixed(2));
  };

  const handleSubmit = async () => {
    if (isInvalid || exceedsSpent) return;
    setIsSubmitting(true);
    try {
      await onAdjust(newBudget);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = !isInvalid && !exceedsSpent && newBudget !== currentBudget && !isSubmitting;

  return (
    <div className={cn('rounded-lg border bg-card p-4 shadow-sm', className)}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">
          Ajustar Budget
        </h3>
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          {showPreview ? 'Ocultar' : 'Ver'} preview
          {showPreview ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Current Budget Display */}
      <div className="mb-3 rounded-md bg-slate-50 p-2 text-center">
        <span className="text-xs text-slate-500">Budget atual</span>
        <p className="text-lg font-semibold text-slate-700">${currentBudget.toFixed(2)}</p>
      </div>

      {/* Quick Adjustment Buttons */}
      <div className="mb-4 grid grid-cols-5 gap-1">
        {PRESET_ADJUSTMENTS.map((adjust) => {
          const isDisabled = adjust.delta < 0 && (!canDecrease || !canDecrease);
          const newValue = currentBudget + adjust.delta;
          const wouldBeInvalid = newValue < minBudget;

          return (
            <button
              key={adjust.label}
              type="button"
              disabled={isDisabled || wouldBeInvalid || isSubmitting}
              onClick={() => handleQuickAdjust(adjust.delta)}
              className={cn(
                'rounded-md border px-1 py-1.5 text-xs font-medium transition-all',
                adjust.delta > 0
                  ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                  : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
                (isDisabled || wouldBeInvalid) && 'cursor-not-allowed opacity-40',
                isSubmitting && 'cursor-not-allowed opacity-50'
              )}
            >
              {adjust.label}
            </button>
          );
        })}
      </div>

      {/* Custom Budget Input */}
      <div className="mb-4">
        <Label htmlFor="new-budget" className="text-xs text-slate-500">
          Novo budget (USD)
        </Label>
        <div className="relative mt-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
          <Input
            id="new-budget"
            type="number"
            min={minBudget}
            step="0.01"
            value={customBudget}
            onChange={(e) => setCustomBudget(e.target.value)}
            className="pl-7"
            disabled={isSubmitting}
          />
        </div>
        {isInvalid && (
          <p className="mt-1 text-xs text-red-600">
            Valor mínimo: ${minBudget.toFixed(2)}
          </p>
        )}
        {exceedsSpent && (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
            <AlertCircle className="h-3 w-3" />
            Não pode ser menor que o valor já gasto (${budgetSpent.toFixed(2)})
          </p>
        )}
      </div>

      {/* Preview Panel */}
      {showPreview && (
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3">
          <h4 className="mb-2 text-xs font-medium text-slate-600">Preview da mudança</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Budget atual:</span>
              <span className="font-medium">${currentBudget.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Novo budget:</span>
              <span className={cn('font-medium', isDecrease ? 'text-red-600' : 'text-green-600')}>
                ${newBudget.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1">
              <span className="text-slate-500">Diferença:</span>
              <span className={cn('font-medium', isDecrease ? 'text-red-600' : 'text-green-600')}>
                {isDecrease ? '' : '+'}${(newBudget - currentBudget).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Decrease Warning */}
      {isDecrease && !canDecrease && (
        <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-2">
          <p className="flex items-center gap-1 text-xs text-yellow-800">
            <AlertCircle className="h-3 w-3 shrink-0" />
            Diminuição não permitida enquanto agent está rodando
          </p>
        </div>
      )}

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full"
        variant={isDecrease ? 'destructive' : 'default'}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Aplicando...
          </>
        ) : (
          <>
            {isDecrease ? (
              <Minus className="mr-2 h-4 w-4" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            {isDecrease ? 'Diminuir' : 'Aumentar'} budget
          </>
        )}
      </Button>
    </div>
  );
}

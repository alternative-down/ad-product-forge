'use client';

import React, { useState } from 'react';
import { cn } from '@forge/ui';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@forge/ui';
import { Input } from '@forge/ui';
import { Label } from '@forge/ui';
import { Checkbox } from '@forge/ui';

export interface QuickTopUpCardProps {
  /** Current budget remaining */
  budgetRemaining: number;
  /** Callback when top-up is confirmed */
  onTopUp: (amount: number, confirmed: boolean) => Promise<void>;
  /** Loading state */
  isLoading?: boolean;
  /** Custom class */
  className?: string;
}

const PRESET_AMOUNTS = [
  { amount: 10, label: '$10' },
  { amount: 25, label: '$25' },
  { amount: 50, label: '$50' },
];

const HIGH_VALUE_THRESHOLD = 100;

export function QuickTopUpCard({
  budgetRemaining,
  onTopUp,
  className,
}: QuickTopUpCardProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [confirmHighValue, setConfirmHighValue] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const finalAmount = selectedAmount ?? parseFloat(customAmount) || 0;
  const requiresConfirmation = finalAmount >= HIGH_VALUE_THRESHOLD;
  const canSubmit = finalAmount > 0 && (!requiresConfirmation || confirmHighValue) && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onTopUp(finalAmount, requiresConfirmation);
      setSelectedAmount(null);
      setCustomAmount('');
      setConfirmHighValue(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={cn('rounded-lg border bg-card p-4 shadow-sm', className)}>
      <h3 className="mb-3 text-sm font-semibold text-slate-700">
        Top-up Rápido
      </h3>

      {/* Preset Amounts */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {PRESET_AMOUNTS.map((preset) => (
          <button
            key={preset.amount}
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              setSelectedAmount(preset.amount);
              setCustomAmount('');
            }}
            className={cn(
              'rounded-md border px-3 py-2 text-sm font-medium transition-all',
              selectedAmount === preset.amount
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
              isSubmitting && 'cursor-not-allowed opacity-50'
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Custom Amount */}
      <div className="mb-4">
        <Label htmlFor="custom-amount" className="text-xs text-slate-500">
          Ou valor personalizado
        </Label>
        <div className="relative mt-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
          <Input
            id="custom-amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={customAmount}
            onChange={(e) => {
              setCustomAmount(e.target.value);
              setSelectedAmount(null);
            }}
            className="pl-7"
            disabled={isSubmitting}
          />
        </div>
      </div>

      {/* High Value Confirmation */}
      {requiresConfirmation && (
        <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-3">
          <label className="flex cursor-pointer items-start gap-2">
            <Checkbox
              checked={confirmHighValue}
              onCheckedChange={(checked) => setConfirmHighValue(checked === true)}
              className="mt-0.5"
              disabled={isSubmitting}
            />
            <span className="text-xs text-yellow-800">
              Confirmo que desejo adicionar <strong>${finalAmount.toFixed(2)}</strong> ao budget. 
              Valor superior a ${HIGH_VALUE_THRESHOLD}.
            </span>
          </label>
        </div>
      )}

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processando...
          </>
        ) : (
          <>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar ${finalAmount > 0 ? finalAmount.toFixed(2) : '0.00'}
          </>
        )}
      </Button>

      {/* New Balance Preview */}
      {finalAmount > 0 && (
        <p className="mt-3 text-center text-xs text-slate-500">
          Novo budget: <span className="font-medium text-slate-700">${(budgetRemaining + finalAmount).toFixed(2)}</span>
        </p>
      )}
    </div>
  );
}

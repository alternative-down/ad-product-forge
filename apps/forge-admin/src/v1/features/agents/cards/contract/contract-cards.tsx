import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { Input } from '../../../../components/ui/input';
import { LabeledField } from '../../ui';

export function ContractTopUpCard(input: {
  pending: boolean;
  error: string | null;
  disabled: boolean;
  onSubmit(amountUsd: number): void;
}) {
  const [amountUsd, setAmountUsd] = useState('10');

  return (
    <Card className="p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Contract top up</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Increase the active contract budget without rehiring the agent.
        </p>
      </div>

      <form
        className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          input.onSubmit(Number(amountUsd));
        }}
      >
        <LabeledField label="Amount (USD)" className="min-w-[220px]">
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={amountUsd}
            onChange={(event) => setAmountUsd(event.target.value)}
            disabled={input.disabled || input.pending}
            required
          />
        </LabeledField>
        <Button type="submit" disabled={input.disabled || input.pending}>
          {input.pending ? (
            <>
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              Applying...
            </>
          ) : (
            'Top up budget'
          )}
        </Button>
      </form>

      {input.error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {input.error}
        </div>
      ) : null}
    </Card>
  );
}

export function ContractBudgetAdjustCard(input: {
  pending: boolean;
  error: string | null;
  disabled: boolean;
  currentBudgetUsd: number;
  spentUsd: number;
  onSubmit(newBudgetUsd: number): void;
}) {
  const [newBudgetUsd, setNewBudgetUsd] = useState('');

  const difference = newBudgetUsd ? Number(newBudgetUsd) - input.currentBudgetUsd : 0;
  const isIncrease = difference > 0;

  return (
    <Card className="p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Set contract value</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the desired weekly contract value. The system applies the increase or decrease using the existing contract rules.
        </p>
      </div>

      <form
        className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          input.onSubmit(Number(newBudgetUsd));
        }}
      >
        <LabeledField label="Desired value (USD)" className="min-w-[220px]">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={newBudgetUsd}
            onChange={(event) => setNewBudgetUsd(event.target.value)}
            disabled={input.disabled || input.pending}
            required
          />
        </LabeledField>
        {newBudgetUsd && difference !== 0 ? (
          <div className="rounded-full border border-[color:var(--panel-border-strong)] bg-[color:var(--panel-strong)] px-3 py-2 text-sm">
            {isIncrease ? (
              <span className="text-green-600">+${difference.toFixed(2)}/week</span>
            ) : (
              <span className="text-orange-600">-${Math.abs(difference).toFixed(2)}/week</span>
            )}
          </div>
        ) : null}
        <Button type="submit" disabled={input.disabled || input.pending || !newBudgetUsd}>
          {input.pending ? (
            <>
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              Applying...
            </>
          ) : (
            'Apply value'
          )}
        </Button>
      </form>

      {input.error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {input.error}
        </div>
      ) : null}
    </Card>
  );
}

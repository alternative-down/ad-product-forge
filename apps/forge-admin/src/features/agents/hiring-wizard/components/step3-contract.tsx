import { useState } from 'react';
import { useWizardStore, validateContract, type BudgetType } from '../stores/wizard-store';
import { Input } from '../../../../components/ui/input';
import { Select } from '../../../../components/ui/select';
import { Button } from '../../../../components/ui/button';

const DAYS = [
  { value: 'mon', label: 'Seg' },
  { value: 'tue', label: 'Ter' },
  { value: 'wed', label: 'Qua' },
  { value: 'thu', label: 'Qui' },
  { value: 'fri', label: 'Sex' },
  { value: 'sat', label: 'Sáb' },
  { value: 'sun', label: 'Dom' },
];

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: `${i.toString().padStart(2, '0')}:00`,
  label: `${i.toString().padStart(2, '0')}:00`,
}));

export function Step3Contract() {
  const { contract, setContract } = useWizardStore();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const budgetTypeLabels: Record<BudgetType, string> = {
    week: 'Semana',
    month: 'Mês',
    year: 'Ano',
  };

  const budgetTypePrepositions: Record<BudgetType, string> = {
    week: 'por semana',
    month: 'por mês',
    year: 'por ano',
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors(validateContract(contract));
  };

  const toggleDay = (day: string) => {
    const currentDays = (contract.scheduleDays || []) as string[];
    const newDays = currentDays.includes(day)
      ? currentDays.filter((d: string) => d !== day)
      : [...currentDays, day];
    setContract({ scheduleDays: newDays });
  };

  // Calculate estimated monthly cost
  const getMonthlyEstimate = () => {
    const amount = parseFloat(contract.budgetAmount) || 0;
    switch (contract.budgetType) {
      case 'week': return amount * 4.33;
      case 'year': return amount / 12;
      default: return amount;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-1">Contract</h2>
        <p className="text-sm text-muted-foreground">Defina o orçamento e cronograma do agent.</p>
        <p className="text-xs text-muted-foreground mt-1">Step 3 de 5</p>
      </div>

      <div className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Budget Type</h3>
          <div className="flex gap-4">
            {(['week', 'month', 'year'] as BudgetType[]).map((type) => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="budgetType"
                  value={type}
                  checked={contract.budgetType === type}
                  onChange={() => setContract({ budgetType: type })}
                  className="accent-primary"
                />
                <span className="text-sm">{budgetTypeLabels[type]}</span>
              </label>
            ))}
          </div>

          <div>
            <label className="text-sm font-medium">Budget Amount *</label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">$</span>
              <Input
                type="number"
                min="5"
                step="0.01"
                placeholder="25.00"
                value={contract.budgetAmount}
                onChange={(e) => setContract({ budgetAmount: e.target.value })}
                onBlur={() => handleBlur('budgetAmount')}
                className={`w-32 ${touched.budgetAmount && errors.budgetAmount ? 'border-destructive' : ''}`}
              />
              <span className="text-sm text-muted-foreground">{budgetTypePrepositions[contract.budgetType]}</span>
            </div>
            {touched.budgetAmount && errors.budgetAmount && (
              <p className="text-xs text-destructive mt-1">{errors.budgetAmount}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              💡 Valor mínimo recomendado: $5.00/semana
            </p>
          </div>

          <div className="p-4 rounded-lg bg-muted/50">
            <div className="text-sm font-medium mb-2">Estimated Usage</div>
            <div className="h-3 bg-muted rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min(contract.estimatedUsage, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>${(getMonthlyEstimate() * (contract.estimatedUsage / 100)).toFixed(2)} de ${getMonthlyEstimate().toFixed(2)}</span>
              <span>{contract.estimatedUsage}% utilizado</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Modelo: {contract.budgetType === 'week' ? 'GPT-4o Mini' : '-'}</p>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium">Schedule</h3>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="scheduleType"
                value="always"
                checked={contract.scheduleType === 'always'}
                onChange={() => setContract({ scheduleType: 'always' })}
                className="accent-primary"
              />
              <span className="text-sm">Sempre ativo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="scheduleType"
                value="scheduled"
                checked={contract.scheduleType === 'scheduled'}
                onChange={() => setContract({ scheduleType: 'scheduled' })}
                className="accent-primary"
              />
              <span className="text-sm">Agendar</span>
            </label>
          </div>

          {contract.scheduleType === 'scheduled' && (
            <div className="space-y-4 pl-6 border-l-2 border-muted">
              <div className="flex gap-4">
                <div>
                  <label className="text-xs text-muted-foreground">Start Time</label>
                  <Select
                    value={contract.scheduleStartTime || '09:00'}
                    onChange={(v) => setContract({ scheduleStartTime: v })}
                    options={TIME_OPTIONS}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">End Time</label>
                  <Select
                    value={contract.scheduleEndTime || '18:00'}
                    onChange={(v) => setContract({ scheduleEndTime: v })}
                    options={TIME_OPTIONS}
                  />
                </div>
              </div>
              <div>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day) => (
                    <Button
                      key={day.value}
                      type="button"
                      variant={contract.scheduleDays?.includes(day.value) ? 'primary' : 'ghost'}
                      onClick={() => toggleDay(day.value)}
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>
                {touched.scheduleDays && errors.scheduleDays && (
                  <p className="text-xs text-destructive mt-1">{errors.scheduleDays}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

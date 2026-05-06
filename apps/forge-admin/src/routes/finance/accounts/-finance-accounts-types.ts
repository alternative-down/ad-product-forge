import type { CreatePayableInput } from '@/lib/admin-api/index';

export type MovementForm = {
  kind: 'single' | 'recurring';
  direction: 'in' | 'out';
  name: string;
  description: string;
  amountUsd: number;
  date: string;
  recurrencePeriod: 'weekly' | 'monthly' | 'yearly';
};

export function createEmptyMovementForm(): MovementForm {
  return {
    kind: 'single',
    direction: 'out',
    name: '',
    description: '',
    amountUsd: 0,
    date: '',
    recurrencePeriod: 'monthly',
  };
}

export function toPayableInput(form: MovementForm): CreatePayableInput {
  if (form.kind === 'single') {
    return {
      kind: 'single',
      name: form.name.trim() || 'Movimento avulso',
      description: form.description.trim() || undefined,
      amountUsd: form.amountUsd,
      dueAt: form.date,
    };
  }

  return {
    kind: 'recurring',
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    amountUsd: form.amountUsd,
    dueAt: form.date,
    recurrencePeriod: form.recurrencePeriod,
  };
}

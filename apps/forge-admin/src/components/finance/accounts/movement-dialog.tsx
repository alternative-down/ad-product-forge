import {
  AdminButton,
  AdminDialogBody,
  AdminDialogContent,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminInput,
  AdminTextarea,
} from '@/components/admin';
import { Dialog } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { humanizeRecurrencePeriod } from './-finance-accounts-format';
import type { MovementForm } from './-finance-accounts-types';

export function MovementDialog(input: {
  open: boolean;
  pending: boolean;
  form: MovementForm;
  onOpenChange(open: boolean): void;
  onFormChange(value: MovementForm): void;
  onSubmit(): void;
}) {
  return (
    <Dialog open={input.open} onOpenChange={input.onOpenChange}>
      <AdminDialogContent>
        <AdminDialogHeader>
          <AdminDialogTitle>Novo cadastro</AdminDialogTitle>
        </AdminDialogHeader>

        <form
          className="flex flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            input.onSubmit();
          }}
        >
          <AdminDialogBody>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="finance-entry-kind">
                Tipo
              </label>
              <Select
                value={input.form.kind}
                onValueChange={(value: MovementForm['kind']) =>
                  input.onFormChange({ ...input.form, kind: value })
                }
                disabled={input.pending}
              >
                <SelectTrigger id="finance-entry-kind" className="w-full">
                  <SelectValue>
                    {input.form.kind === 'single' ? 'Movimento avulso' : 'Conta recorrente'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Movimento avulso</SelectItem>
                  <SelectItem value="recurring">Conta recorrente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {input.form.kind === 'single' ? (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="finance-entry-direction">
                  Direção
                </label>
                <Select
                  value={input.form.direction}
                  onValueChange={(value: 'in' | 'out') =>
                    input.onFormChange({ ...input.form, direction: value })
                  }
                  disabled={input.pending}
                >
                  <SelectTrigger id="finance-entry-direction" className="w-full">
                    <SelectValue>
                      {input.form.direction === 'in' ? 'Entrada' : 'Saída'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Entrada</SelectItem>
                    <SelectItem value="out">Saída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {input.form.kind === 'recurring' || input.form.direction === 'out' ? (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="finance-entry-name">
                  Nome
                </label>
                <AdminInput
                  id="finance-entry-name"
                  value={input.form.name}
                  onChange={(event) => input.onFormChange({ ...input.form, name: event.target.value })}
                  disabled={input.pending}
                />
              </div>
            ) : null}

            <div className="grid gap-4 min-[560px]:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="finance-entry-amount">
                  Valor
                </label>
                <AdminInput
                  id="finance-entry-amount"
                  type="number"
                  step="0.01"
                  value={input.form.amountUsd}
                  onChange={(event) =>
                    input.onFormChange({
                      ...input.form,
                      amountUsd: Number(event.target.value) || 0,
                    })
                  }
                  disabled={input.pending}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="finance-entry-date">
                  Data
                </label>
                <AdminInput
                  id="finance-entry-date"
                  type="datetime-local"
                  value={input.form.date}
                  onChange={(event) => input.onFormChange({ ...input.form, date: event.target.value })}
                  disabled={input.pending}
                />
              </div>
            </div>

            {input.form.kind === 'recurring' ? (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="finance-entry-recurrence">
                  Recorrência
                </label>
                <Select
                  value={input.form.recurrencePeriod}
                  onValueChange={(value: 'weekly' | 'monthly' | 'yearly') =>
                    input.onFormChange({ ...input.form, recurrencePeriod: value })
                  }
                  disabled={input.pending}
                >
                  <SelectTrigger id="finance-entry-recurrence" className="w-full">
                    <SelectValue>
                      {humanizeRecurrencePeriod(input.form.recurrencePeriod)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="finance-entry-description">
                Descrição
              </label>
              <AdminTextarea
                id="finance-entry-description"
                rows={4}
                value={input.form.description}
                onChange={(event) => input.onFormChange({ ...input.form, description: event.target.value })}
                disabled={input.pending}
              />
            </div>
          </AdminDialogBody>

          <AdminDialogFooter>
            <AdminButton type="submit" disabled={input.pending}>
              {input.pending ? 'Salvando...' : 'Salvar'}
            </AdminButton>
          </AdminDialogFooter>
        </form>
      </AdminDialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

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
import { hireAgent } from '@/lib/admin-api';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

type HireAgentDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
};

type HireAgentForm = {
  hiringRequest: string;
  additionalContext: string;
  weeklyBudgetUsd: string;
};

const EMPTY_FORM: HireAgentForm = {
  hiringRequest: '',
  additionalContext: '',
  weeklyBudgetUsd: '',
};

export function HireAgentDialog(input: HireAgentDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<HireAgentForm>(EMPTY_FORM);
  const mutation = useMutation({
    mutationFn: async () =>
      hireAgent({
        hiringRequest: form.hiringRequest.trim(),
        additionalContext: form.additionalContext.trim() || undefined,
        weeklyBudgetUsd: Number(form.weeklyBudgetUsd),
      }),
    onMutate: () => startAdminAction('Contratando agente...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Agente contratado.');
      input.onOpenChange(false);
      setForm(EMPTY_FORM);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'finance-contracts'] }),
      ]);
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const validBudget = Number(form.weeklyBudgetUsd) > 0;

  return (
    <Dialog
      open={input.open}
      onOpenChange={(open) => {
        input.onOpenChange(open);

        if (!open) {
          setForm(EMPTY_FORM);
        }
      }}
    >
      <AdminDialogContent>
        <AdminDialogHeader>
          <AdminDialogTitle>Contratar agente</AdminDialogTitle>
        </AdminDialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <AdminDialogBody>
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="hire-request">
                  Pedido
                </label>
                <AdminTextarea
                  id="hire-request"
                  rows={5}
                  value={form.hiringRequest}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      hiringRequest: event.target.value,
                    }))
                  }
                  disabled={mutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="hire-context">
                  Contexto
                </label>
                <AdminTextarea
                  id="hire-context"
                  rows={5}
                  value={form.additionalContext}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      additionalContext: event.target.value,
                    }))
                  }
                  disabled={mutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="hire-weekly-budget">
                  Valor semanal
                </label>
                <AdminInput
                  id="hire-weekly-budget"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.weeklyBudgetUsd}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      weeklyBudgetUsd: event.target.value,
                    }))
                  }
                  disabled={mutation.isPending}
                />
              </div>

              {mutation.error ? <div className="text-sm text-destructive">{mutation.error.message}</div> : null}
            </div>
          </AdminDialogBody>

          <AdminDialogFooter>
            <AdminButton type="submit" disabled={mutation.isPending || !form.hiringRequest.trim() || !validBudget}>
              {mutation.isPending ? 'Contratando...' : 'Contratar'}
            </AdminButton>
          </AdminDialogFooter>
        </form>
      </AdminDialogContent>
    </Dialog>
  );
}

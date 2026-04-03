import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Power, PowerOff, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  AdminButton,
  AdminDialogContent,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminInput,
  AdminTextarea,
  PageHeader,
} from '@/components/admin';
import { Dialog } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  cancelPlannedLedgerEntry,
  createInvestment,
  createPayable,
  getFinance,
  postPlannedLedgerEntry,
  setRecurringPayableActive,
  type CreatePayableInput,
} from '@/lib/admin-api';

export const Route = createFileRoute('/finance/accounts/')({
  component: FinanceAccountsIndexRoute,
});

type MovementForm = {
  kind: 'movement' | 'single' | 'recurring';
  name: string;
  description: string;
  amountUsd: number;
  date: string;
  recurrencePeriod: 'weekly' | 'monthly' | 'yearly';
};

function createEmptyMovementForm(): MovementForm {
  return {
    kind: 'movement',
    name: '',
    description: '',
    amountUsd: 0,
    date: '',
    recurrencePeriod: 'monthly',
  };
}

function FinanceAccountsIndexRoute() {
  const queryClient = useQueryClient();
  const financeQuery = useQuery({
    queryKey: ['admin', 'finance'],
    queryFn: getFinance,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [movementForm, setMovementForm] = useState<MovementForm>(createEmptyMovementForm);
  const createMutation = useMutation({
    mutationFn: async (input: MovementForm) => {
      if (input.kind === 'movement') {
        return createInvestment({
          amountUsd: input.amountUsd,
          description: input.description.trim() || input.name.trim() || undefined,
          effectiveAt: input.date || undefined,
        });
      }

      return createPayable(toPayableInput(input));
    },
    onSuccess: async () => {
      setDialogOpen(false);
      setMovementForm(createEmptyMovementForm());
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance-contracts'] });
    },
  });
  const postMutation = useMutation({
    mutationFn: ({ entryId, effectiveAt }: { entryId: string; effectiveAt?: string }) =>
      postPlannedLedgerEntry(entryId, effectiveAt),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
    },
  });
  const cancelMutation = useMutation({
    mutationFn: cancelPlannedLedgerEntry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
    },
  });
  const recurringMutation = useMutation({
    mutationFn: ({ payableId, isActive }: { payableId: string; isActive: boolean }) =>
      setRecurringPayableActive(payableId, isActive),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
    },
  });
  const plannedMovements = useMemo(
    () => (financeQuery.data?.movements.items ?? []).filter((item) => item.status === 'planned'),
    [financeQuery.data?.movements.items],
  );
  const recurringPayables = useMemo(
    () => financeQuery.data?.recurringPayables ?? [],
    [financeQuery.data?.recurringPayables],
  );

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="Contas a pagar/receber" />

      <section className="space-y-5">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Cadastros</div>
        </div>

        <div className="flex justify-end">
          <AdminButton
            onClick={() => {
              setMovementForm(createEmptyMovementForm());
              setDialogOpen(true);
            }}
          >
            Novo
          </AdminButton>
        </div>

        {createMutation.error ? <div className="text-sm text-destructive">{createMutation.error.message}</div> : null}
      </section>

      <section className="space-y-5">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Agenda de movimentos</div>
        </div>

        <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
          <Table className="text-sm">
            <TableHeader className="bg-muted/50 text-left text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
                <TableHead className="px-4 py-3 text-right font-medium">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plannedMovements.map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell className="px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {movement.description?.trim() || humanizeMovementType(movement.type)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatUsdSigned(movement.amountUsd, movement.direction)} · {formatDateTime(movement.dueAt ?? movement.createdAt)}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <AdminButton
                        variant="ghost"
                        size="icon"
                        disabled={postMutation.isPending || cancelMutation.isPending}
                        onClick={() => {
                          postMutation.mutate({ entryId: movement.id });
                        }}
                      >
                        <Check className="h-4 w-4" />
                        <span className="sr-only">Postar</span>
                      </AdminButton>
                      <AdminButton
                        variant="ghost"
                        size="icon"
                        disabled={postMutation.isPending || cancelMutation.isPending}
                        onClick={() => {
                          cancelMutation.mutate(movement.id);
                        }}
                      >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Cancelar</span>
                      </AdminButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {plannedMovements.length === 0 ? (
                <TableRow>
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={2}>
                    Nenhum movimento previsto.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {financeQuery.error ? <div className="text-sm text-destructive">{financeQuery.error.message}</div> : null}
        {postMutation.error ? <div className="text-sm text-destructive">{postMutation.error.message}</div> : null}
        {cancelMutation.error ? <div className="text-sm text-destructive">{cancelMutation.error.message}</div> : null}
      </section>

      <section className="space-y-5 border-t border-border pt-6">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Contas recorrentes</div>
        </div>

        <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
          <Table className="text-sm">
            <TableHeader className="bg-muted/50 text-left text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
                <TableHead className="px-4 py-3 text-right font-medium">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recurringPayables.map((payable) => (
                <TableRow key={payable.payableId}>
                  <TableCell className="px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{payable.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatUsd(payable.amountUsd)} · {humanizeRecurrencePeriod(payable.recurrencePeriod)} ·{' '}
                        {formatDateTime(payable.nextDueAt)}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <AdminButton
                        variant="ghost"
                        size="icon"
                        disabled={recurringMutation.isPending}
                        onClick={() => {
                          recurringMutation.mutate({
                            payableId: payable.payableId,
                            isActive: !payable.isActive,
                          });
                        }}
                      >
                        {payable.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        <span className="sr-only">{payable.isActive ? 'Inativar' : 'Ativar'}</span>
                      </AdminButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {recurringPayables.length === 0 ? (
                <TableRow>
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={2}>
                    Nenhuma conta recorrente ainda.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {recurringMutation.error ? <div className="text-sm text-destructive">{recurringMutation.error.message}</div> : null}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Novo cadastro</AdminDialogTitle>
          </AdminDialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate(movementForm);
            }}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="finance-entry-kind">
                Tipo
              </label>
              <Select
                value={movementForm.kind}
                onValueChange={(value: MovementForm['kind']) =>
                  setMovementForm((current) => ({ ...current, kind: value }))
                }
                disabled={createMutation.isPending}
              >
                <SelectTrigger id="finance-entry-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="movement">Movimento</SelectItem>
                  <SelectItem value="single">Conta avulsa</SelectItem>
                  <SelectItem value="recurring">Conta recorrente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {movementForm.kind === 'movement' ? null : (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="finance-entry-name">
                  Nome
                </label>
                <AdminInput
                  id="finance-entry-name"
                  value={movementForm.name}
                  onChange={(event) => setMovementForm((current) => ({ ...current, name: event.target.value }))}
                  disabled={createMutation.isPending}
                />
              </div>
            )}

            <div className="grid gap-4 min-[560px]:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="finance-entry-amount">
                  Valor
                </label>
                <AdminInput
                  id="finance-entry-amount"
                  type="number"
                  step="0.01"
                  value={movementForm.amountUsd}
                  onChange={(event) =>
                    setMovementForm((current) => ({
                      ...current,
                      amountUsd: Number(event.target.value) || 0,
                    }))
                  }
                  disabled={createMutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="finance-entry-date">
                  Data
                </label>
                <AdminInput
                  id="finance-entry-date"
                  type="datetime-local"
                  value={movementForm.date}
                  onChange={(event) => setMovementForm((current) => ({ ...current, date: event.target.value }))}
                  disabled={createMutation.isPending}
                />
              </div>
            </div>

            {movementForm.kind === 'recurring' ? (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="finance-entry-recurrence">
                  Recorrência
                </label>
                <Select
                  value={movementForm.recurrencePeriod}
                  onValueChange={(value: 'weekly' | 'monthly' | 'yearly') =>
                    setMovementForm((current) => ({ ...current, recurrencePeriod: value }))
                  }
                  disabled={createMutation.isPending}
                >
                  <SelectTrigger id="finance-entry-recurrence" className="w-full">
                    <SelectValue />
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
                value={movementForm.description}
                onChange={(event) => setMovementForm((current) => ({ ...current, description: event.target.value }))}
                disabled={createMutation.isPending}
              />
            </div>

            <AdminDialogFooter>
              <AdminButton type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Salvando...' : 'Salvar'}
              </AdminButton>
            </AdminDialogFooter>
          </form>
        </AdminDialogContent>
      </Dialog>
    </div>
  );
}

function toPayableInput(form: MovementForm): CreatePayableInput {
  if (form.kind === 'single') {
    return {
      kind: 'single',
      name: form.name.trim(),
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

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatUsdSigned(value: number, direction: 'in' | 'out') {
  const amount = formatUsd(value);

  return direction === 'out' ? `-${amount}` : `+${amount}`;
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

function humanizeMovementType(type: string) {
  if (type === 'owner-investment') {
    return 'Movimento manual';
  }

  if (type === 'manual-payable') {
    return 'Conta avulsa';
  }

  return type;
}

function humanizeRecurrencePeriod(value: 'weekly' | 'monthly' | 'yearly') {
  if (value === 'weekly') {
    return 'Semanal';
  }

  if (value === 'monthly') {
    return 'Mensal';
  }

  return 'Anual';
}

import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Power, PowerOff } from 'lucide-react';
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
  createPayable,
  getFinance,
  setRecurringPayableActive,
  type CreatePayableInput,
} from '@/lib/admin-api';

export const Route = createFileRoute('/finance/accounts/')({
  component: FinanceAccountsIndexRoute,
});

type PayableForm = {
  kind: 'single' | 'recurring';
  name: string;
  description: string;
  amountUsd: number;
  dueAt: string;
  recurrencePeriod: 'weekly' | 'monthly' | 'yearly';
};

function createEmptyPayableForm(): PayableForm {
  return {
    kind: 'single',
    name: '',
    description: '',
    amountUsd: 0,
    dueAt: '',
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
  const [payableForm, setPayableForm] = useState<PayableForm>(createEmptyPayableForm);
  const payableMutation = useMutation({
    mutationFn: createPayable,
    onSuccess: async () => {
      setDialogOpen(false);
      setPayableForm(createEmptyPayableForm());
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
  const recurringPayables = useMemo(
    () => financeQuery.data?.recurringPayables ?? [],
    [financeQuery.data?.recurringPayables],
  );
  const activeRecurringCount = recurringPayables.filter((item) => item.isActive).length;

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="Contas a pagar/receber" />

      <section className="space-y-5">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Resumo</div>
        </div>

        <dl className="grid gap-4 min-[720px]:grid-cols-2 xl:grid-cols-4">
          <MetricItem label="Recorrentes" value={String(recurringPayables.length)} />
          <MetricItem label="Ativas" value={String(activeRecurringCount)} />
          <MetricItem label="Saídas previstas" value={formatUsd(financeQuery.data?.summary.scheduledOutUsd ?? 0)} />
          <MetricItem label="Saldo" value={formatUsd(financeQuery.data?.balanceUsd ?? 0)} />
        </dl>
      </section>

      <section className="space-y-5">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Contas recorrentes</div>
        </div>

        <div className="flex justify-end">
          <AdminButton
            onClick={() => {
              setPayableForm(createEmptyPayableForm());
              setDialogOpen(true);
            }}
          >
            Novo
          </AdminButton>
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

        {financeQuery.error ? <div className="pt-4 text-sm text-destructive">{financeQuery.error.message}</div> : null}
        {payableMutation.error ? <div className="pt-4 text-sm text-destructive">{payableMutation.error.message}</div> : null}
        {recurringMutation.error ? <div className="pt-4 text-sm text-destructive">{recurringMutation.error.message}</div> : null}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Nova conta</AdminDialogTitle>
          </AdminDialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              payableMutation.mutate(toPayableInput(payableForm));
            }}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="finance-payable-kind">
                Tipo
              </label>
              <Select
                value={payableForm.kind}
                onValueChange={(value: 'single' | 'recurring') =>
                  setPayableForm((current) => ({ ...current, kind: value }))
                }
                disabled={payableMutation.isPending}
              >
                <SelectTrigger id="finance-payable-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Conta avulsa</SelectItem>
                  <SelectItem value="recurring">Conta recorrente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 min-[560px]:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="finance-payable-name">
                  Nome
                </label>
                <AdminInput
                  id="finance-payable-name"
                  value={payableForm.name}
                  onChange={(event) => setPayableForm((current) => ({ ...current, name: event.target.value }))}
                  disabled={payableMutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="finance-payable-amount">
                  Valor
                </label>
                <AdminInput
                  id="finance-payable-amount"
                  type="number"
                  step="0.01"
                  value={payableForm.amountUsd}
                  onChange={(event) =>
                    setPayableForm((current) => ({
                      ...current,
                      amountUsd: Number(event.target.value) || 0,
                    }))
                  }
                  disabled={payableMutation.isPending}
                />
              </div>
            </div>

            <div className="grid gap-4 min-[560px]:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="finance-payable-due-at">
                  Data
                </label>
                <AdminInput
                  id="finance-payable-due-at"
                  type="datetime-local"
                  value={payableForm.dueAt}
                  onChange={(event) => setPayableForm((current) => ({ ...current, dueAt: event.target.value }))}
                  disabled={payableMutation.isPending}
                />
              </div>

              {payableForm.kind === 'recurring' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="finance-payable-recurrence">
                    Recorrência
                  </label>
                  <Select
                    value={payableForm.recurrencePeriod}
                    onValueChange={(value: 'weekly' | 'monthly' | 'yearly') =>
                      setPayableForm((current) => ({
                        ...current,
                        recurrencePeriod: value,
                      }))
                    }
                    disabled={payableMutation.isPending}
                  >
                    <SelectTrigger id="finance-payable-recurrence" className="w-full">
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
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="finance-payable-description">
                Descrição
              </label>
              <AdminTextarea
                id="finance-payable-description"
                rows={4}
                value={payableForm.description}
                onChange={(event) => setPayableForm((current) => ({ ...current, description: event.target.value }))}
                disabled={payableMutation.isPending}
              />
            </div>

            <AdminDialogFooter>
              <AdminButton type="submit" disabled={payableMutation.isPending}>
                {payableMutation.isPending ? 'Salvando...' : 'Salvar'}
              </AdminButton>
            </AdminDialogFooter>
          </form>
        </AdminDialogContent>
      </Dialog>
    </div>
  );
}

function toPayableInput(form: PayableForm): CreatePayableInput {
  if (form.kind === 'single') {
    return {
      kind: 'single',
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      amountUsd: form.amountUsd,
      dueAt: form.dueAt,
    };
  }

  return {
    kind: 'recurring',
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    amountUsd: form.amountUsd,
    dueAt: form.dueAt,
    recurrencePeriod: form.recurrencePeriod,
  };
}

function MetricItem(input: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-sm text-muted-foreground">{input.label}</dt>
      <dd className="text-xl font-semibold tracking-[-0.03em]">{input.value}</dd>
    </div>
  );
}

function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
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

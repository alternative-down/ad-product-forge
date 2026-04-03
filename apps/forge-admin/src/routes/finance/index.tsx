import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useMemo } from 'react';

import { AdminButton, PageHeader } from '@/components/admin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  cancelPlannedLedgerEntry,
  getFinance,
  getFinanceContracts,
  postPlannedLedgerEntry,
} from '@/lib/admin-api';

export const Route = createFileRoute('/finance/')({
  component: FinanceIndexRoute,
});

function FinanceIndexRoute() {
  const queryClient = useQueryClient();
  const financeQuery = useQuery({
    queryKey: ['admin', 'finance'],
    queryFn: getFinance,
  });
  const contractsQuery = useQuery({
    queryKey: ['admin', 'finance-contracts'],
    queryFn: getFinanceContracts,
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
  const movements = useMemo(
    () => financeQuery.data?.movements.items ?? [],
    [financeQuery.data?.movements.items],
  );
  const contracts = contractsQuery.data?.items ?? [];
  const scheduledOutUsd =
    (financeQuery.data?.summary.scheduledOutUsd ?? 0) +
    contracts.reduce((total, item) => total + item.weeklyValueUsd, 0);

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="Fluxo de caixa" />

      <section className="space-y-5">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Resumo</div>
        </div>

        <dl className="grid gap-4 min-[720px]:grid-cols-2 xl:grid-cols-4">
          <MetricItem label="Saldo" value={formatUsd(financeQuery.data?.balanceUsd ?? 0)} />
          <MetricItem label="Entradas" value={formatUsd(financeQuery.data?.summary.totalInUsd ?? 0)} />
          <MetricItem label="Saídas" value={formatUsd(financeQuery.data?.summary.totalOutUsd ?? 0)} />
          <MetricItem label="Saídas previstas" value={formatUsd(scheduledOutUsd)} />
        </dl>
      </section>

      <section className="space-y-5">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Contratos</div>
        </div>

        <dl className="grid gap-4 min-[720px]:grid-cols-3">
          <MetricItem label="Ativos" value={String(contracts.length)} />
          <MetricItem
            label="Valor semanal"
            value={formatUsd(contracts.reduce((total, item) => total + item.weeklyValueUsd, 0))}
          />
          <MetricItem
            label="Renovação automática"
            value={String(contracts.filter((item) => item.autoRenew).length)}
          />
        </dl>
      </section>

      <section className="space-y-5">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Movimentos</div>
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
              {movements.map((movement) => {
                const canPost = movement.status === 'planned';
                const canCancel = movement.status === 'planned';

                return (
                  <TableRow key={movement.id}>
                    <TableCell className="px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {movement.description?.trim() || humanizeMovementType(movement.type)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatUsdSigned(movement.amountUsd, movement.direction)} · {humanizeMovementStatus(movement.status)} ·{' '}
                          {formatDateTime(movement.effectiveAt ?? movement.dueAt ?? movement.createdAt)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <AdminButton
                          variant="ghost"
                          size="icon"
                          disabled={!canPost || postMutation.isPending || cancelMutation.isPending}
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
                          disabled={!canCancel || postMutation.isPending || cancelMutation.isPending}
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
                );
              })}
              {movements.length === 0 ? (
                <TableRow>
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={2}>
                    Nenhum movimento ainda.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {financeQuery.error ? <div className="pt-4 text-sm text-destructive">{financeQuery.error.message}</div> : null}
        {contractsQuery.error ? <div className="pt-4 text-sm text-destructive">{contractsQuery.error.message}</div> : null}
        {postMutation.error ? <div className="pt-4 text-sm text-destructive">{postMutation.error.message}</div> : null}
        {cancelMutation.error ? <div className="pt-4 text-sm text-destructive">{cancelMutation.error.message}</div> : null}
      </section>
    </div>
  );
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

function humanizeMovementStatus(status: string) {
  if (status === 'planned') {
    return 'Previsto';
  }

  if (status === 'posted') {
    return 'Postado';
  }

  if (status === 'canceled') {
    return 'Cancelado';
  }

  return status;
}

function humanizeMovementType(type: string) {
  if (type === 'owner-investment') {
    return 'Aporte';
  }

  if (type === 'manual-payable') {
    return 'Conta avulsa';
  }

  return type;
}

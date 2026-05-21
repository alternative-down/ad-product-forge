import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { PageHeader } from '@/components/admin';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getFinance, getFinanceContracts } from '@/lib/admin-api/index';

export const Route = createFileRoute('/finance/')({
  component: FinanceIndexRoute,
});

function FinanceIndexRoute() {
  const financeQuery = useQuery({
    queryKey: ['admin', 'finance'],
    queryFn: getFinance,
  });
  const contractsQuery = useQuery({
    queryKey: ['admin', 'finance-contracts'],
    queryFn: getFinanceContracts,
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

        <dl className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <MetricItem label="Saldo" value={formatUsd(financeQuery.data?.balanceUsd ?? 0)} />
          <MetricItem
            label="Entradas"
            value={formatUsd(financeQuery.data?.summary.totalInUsd ?? 0)}
          />
          <MetricItem
            label="Saídas"
            value={formatUsd(financeQuery.data?.summary.totalOutUsd ?? 0)}
          />
          <MetricItem label="Saídas previstas" value={formatUsd(scheduledOutUsd)} />
        </dl>
      </section>

      <section className="space-y-5">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Contratos</div>
        </div>

        <dl className="grid grid-cols-2 gap-4 xl:grid-cols-3">
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
                <TableHead className="px-4 py-3 font-medium">Valor</TableHead>
                <TableHead className="px-4 py-3 font-medium">Data</TableHead>
                <TableHead className="px-4 py-3 font-medium">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell className="px-4 py-3">{humanizeMovementType(movement.type)}</TableCell>
                  <TableCell className="px-4 py-3">
                    {formatUsdSigned(movement.amountUsd, movement.direction)}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {formatDateTime(movement.effectiveAt ?? movement.dueAt ?? movement.createdAt)}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {humanizeMovementStatus(movement.status)}
                  </TableCell>
                </TableRow>
              ))}
              {movements.length === 0 ? (
                <TableRow>
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={4}>
                    Nenhum movimento ainda.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {financeQuery.error ? (
          <div className="pt-4 text-sm text-destructive">{financeQuery.error.message}</div>
        ) : null}
        {contractsQuery.error ? (
          <div className="pt-4 text-sm text-destructive">{contractsQuery.error.message}</div>
        ) : null}
      </section>
    </div>
  );
}

function MetricItem(input: { label: string; value: string }) {
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

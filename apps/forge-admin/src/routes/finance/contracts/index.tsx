import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { PageHeader } from '@/components/admin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getFinanceContracts } from '@/lib/admin-api';

export const Route = createFileRoute('/finance/contracts/')({
  component: FinanceContractsIndexRoute,
});

function FinanceContractsIndexRoute() {
  const contractsQuery = useQuery({
    queryKey: ['admin', 'finance-contracts'],
    queryFn: getFinanceContracts,
  });
  const contracts = contractsQuery.data?.items ?? [];

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="Contratos" />

      <section className="space-y-5">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Resumo</div>
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
          <div className="text-lg font-semibold tracking-[-0.03em]">Contratos ativos</div>
        </div>

        <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
          <Table className="text-sm">
            <TableHeader className="bg-muted/50 text-left text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((contract) => (
                <TableRow key={contract.contractId}>
                  <TableCell className="px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{contract.agentName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatUsd(contract.weeklyValueUsd)} por semana · {formatDate(contract.startsAt)} até {formatDate(contract.endsAt)} ·{' '}
                        {contract.autoRenew ? 'Renovação automática' : 'Sem renovação automática'}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {contracts.length === 0 ? (
                <TableRow>
                  <TableCell className="px-4 py-6 text-muted-foreground">
                    Nenhum contrato ativo agora.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {contractsQuery.error ? <div className="pt-4 text-sm text-destructive">{contractsQuery.error.message}</div> : null}
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

function formatDate(value: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
  }).format(value);
}

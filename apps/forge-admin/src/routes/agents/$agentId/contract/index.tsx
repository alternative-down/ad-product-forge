import { createFileRoute } from '@tanstack/react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { getAgent, getAgentExecutionSteps } from '@/lib/admin-api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const Route = createFileRoute('/agents/$agentId/contract/')({
  component: AgentContractIndexRoute,
});

const PAGE_SIZE = 20;

function AgentContractIndexRoute() {
  const { agentId } = Route.useParams();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
  });
  const stepsQuery = useInfiniteQuery({
    queryKey: ['admin', 'agent', agentId, 'execution-steps'],
    queryFn: ({ pageParam }) => getAgentExecutionSteps(agentId, PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.hasMore ? lastPageParam + PAGE_SIZE : undefined,
  });
  const steps = stepsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => {
    const target = sentinelRef.current;

    if (!target) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && stepsQuery.hasNextPage && !stepsQuery.isFetchingNextPage) {
        void stepsQuery.fetchNextPage();
      }
    });

    observer.observe(target);
    return () => observer.disconnect();
  }, [stepsQuery]);

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <section className="space-y-5">
        <div className="grid gap-4 min-[720px]:grid-cols-3">
          <MetricItem
            label="Valor do contrato"
            value={agentQuery.data?.activeContract ? formatUsd(agentQuery.data.activeContract.weeklyValueUsd) : 'Sem contrato'}
          />
          <MetricItem
            label="% de uso"
            value={agentQuery.data?.activeContract ? `${formatPercent(agentQuery.data.activeContract.spentPercent)}%` : '0%'}
          />
          <MetricItem
            label="Gasto acumulado"
            value={agentQuery.data?.activeContract ? formatUsd(agentQuery.data.activeContract.spentUsd) : '$0.00'}
          />
        </div>
      </section>

      <section className="space-y-5">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Steps</div>
        </div>

        <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
          <Table className="text-sm">
            <TableHeader className="bg-muted/50 text-left text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 py-3 font-medium">Data</TableHead>
                <TableHead className="px-4 py-3 font-medium">Tipo</TableHead>
                <TableHead className="px-4 py-3 font-medium">Modelo</TableHead>
                <TableHead className="px-4 py-3 font-medium">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {steps.map((step) => (
                <TableRow key={step.stepId}>
                  <TableCell className="px-4 py-3">{formatDateTime(step.createdAt)}</TableCell>
                  <TableCell className="px-4 py-3">{step.kind}</TableCell>
                  <TableCell className="px-4 py-3">{step.modelKey}</TableCell>
                  <TableCell className="px-4 py-3">{formatUsd(step.costUsd)}</TableCell>
                </TableRow>
              ))}
              {steps.length === 0 ? (
                <TableRow>
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={4}>
                    Nenhum step ainda.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        <div ref={sentinelRef} className="h-4" />
        {stepsQuery.isFetchingNextPage ? <div className="text-sm text-muted-foreground">Carregando mais...</div> : null}
        {stepsQuery.error ? <div className="text-sm text-destructive">{stepsQuery.error.message}</div> : null}
      </section>
    </div>
  );
}

function MetricItem(input: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-sm text-muted-foreground">{input.label}</div>
      <div className="text-xl font-semibold tracking-[-0.03em]">{input.value}</div>
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

function formatPercent(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

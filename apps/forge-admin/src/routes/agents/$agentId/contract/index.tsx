import { createFileRoute } from '@tanstack/react-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import {
  adjustAgentContractBudget,
  getAgent,
  getAgentExecutionSteps,
  topUpAgentContract,
} from '@/lib/admin-api';
import {
  AdminButton,
  AdminDialogContent,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminInput,
  PageHeader,
} from '@/components/admin';
import { Dialog } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const Route = createFileRoute('/agents/$agentId/contract/')({
  component: AgentContractIndexRoute,
});

const PAGE_SIZE = 20;

type ContractForm = {
  action: 'adjust-budget' | 'top-up';
  amountUsd: number;
};

function AgentContractIndexRoute() {
  const { agentId } = Route.useParams();
  const queryClient = useQueryClient();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
  });
  const [contractForm, setContractForm] = useState<ContractForm | null>(null);
  const stepsQuery = useInfiniteQuery({
    queryKey: ['admin', 'agent', agentId, 'execution-steps'],
    queryFn: ({ pageParam }) => getAgentExecutionSteps(agentId, PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.hasMore ? lastPageParam + PAGE_SIZE : undefined,
  });
  const mutation = useMutation({
    mutationFn: async (input: ContractForm) => {
      if (input.action === 'top-up') {
        return topUpAgentContract({
          agentId,
          amountUsd: input.amountUsd,
        });
      }

      return adjustAgentContractBudget({
        agentId,
        newBudgetUsd: input.amountUsd,
      });
    },
    onSuccess: async () => {
      setDialogOpen(false);
      setContractForm(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId, 'execution-steps'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance-contracts'] });
    },
  });
  const steps = stepsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const activeContract = agentQuery.data?.activeContract ?? null;

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
        <PageHeader
          title="Contrato"
          actions={
            activeContract ? (
              <AdminButton
                onClick={() => {
                  setContractForm({
                    action: 'adjust-budget',
                    amountUsd: activeContract.weeklyValueUsd,
                  });
                  setDialogOpen(true);
                }}
              >
                Editar
              </AdminButton>
            ) : undefined
          }
        />

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
          <MetricItem
            label="Valor do contrato"
            value={activeContract ? formatUsd(activeContract.weeklyValueUsd) : 'Sem contrato'}
          />
          <MetricItem
            label="% de uso"
            value={activeContract ? `${formatPercent(activeContract.spentPercent)}%` : '0%'}
          />
          <MetricItem
            label="Usado"
            value={activeContract ? formatUsd(activeContract.spentUsd) : '$0.00'}
          />
          <MetricItem
            label="Início"
            value={activeContract ? formatDate(activeContract.startsAt) : 'Sem contrato'}
          />
          <MetricItem
            label="Fim"
            value={activeContract ? formatDate(activeContract.endsAt) : 'Sem contrato'}
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
                <TableHead className="px-4 py-3 font-medium">Input</TableHead>
                <TableHead className="px-4 py-3 font-medium">Cache</TableHead>
                <TableHead className="px-4 py-3 font-medium">Output</TableHead>
                <TableHead className="px-4 py-3 font-medium">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {steps.map((step) => (
                <TableRow key={step.stepId}>
                  <TableCell className="px-4 py-3">{formatDateTime(step.createdAt)}</TableCell>
                  <TableCell className="px-4 py-3">{step.kind}</TableCell>
                  <TableCell className="px-4 py-3">{step.modelKey}</TableCell>
                  <TableCell className="px-4 py-3">{formatInteger(step.inputTokens)}</TableCell>
                  <TableCell className="px-4 py-3">{formatInteger(step.cachedInputTokens)}</TableCell>
                  <TableCell className="px-4 py-3">{formatInteger(step.outputTokens)}</TableCell>
                  <TableCell className="px-4 py-3">{formatUsd(step.costUsd, 6)}</TableCell>
                </TableRow>
              ))}
              {steps.length === 0 ? (
                <TableRow>
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={7}>
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
        {mutation.error ? <div className="text-sm text-destructive">{mutation.error.message}</div> : null}
      </section>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);

          if (!open) {
            setContractForm(null);
          }
        }}
      >
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Alterar contrato</AdminDialogTitle>
          </AdminDialogHeader>

          {contractForm ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate(contractForm);
              }}
            >
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="agent-contract-action">
                  Ação
                </label>
                <Select
                  value={contractForm.action}
                  onValueChange={(value: ContractForm['action']) =>
                    setContractForm((current) => (current ? { ...current, action: value } : current))
                  }
                  disabled={mutation.isPending}
                >
                  <SelectTrigger id="agent-contract-action" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adjust-budget">Ajustar orçamento</SelectItem>
                    <SelectItem value="top-up">Adicionar saldo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="agent-contract-amount">
                  {contractForm.action === 'top-up' ? 'Valor adicional' : 'Novo valor semanal'}
                </label>
                <AdminInput
                  id="agent-contract-amount"
                  type="number"
                  step="0.01"
                  value={contractForm.amountUsd}
                  onChange={(event) =>
                    setContractForm((current) =>
                      current
                        ? {
                            ...current,
                            amountUsd: Number(event.target.value) || 0,
                          }
                        : current,
                    )
                  }
                  disabled={mutation.isPending}
                />
              </div>

              <AdminDialogFooter>
                <AdminButton type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Salvando...' : 'Salvar'}
                </AdminButton>
              </AdminDialogFooter>
            </form>
          ) : null}
        </AdminDialogContent>
      </Dialog>
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

function formatUsd(value: number, fractionDigits = 2) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
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

function formatDate(value: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
  }).format(value);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value);
}

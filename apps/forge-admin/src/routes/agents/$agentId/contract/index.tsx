import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import {
  terminateAgent,
  adjustAgentContractBudget,
  getAgent,
  getAgentExecutionSteps,
  renewAgentContract,
  topUpAgentContract,
} from '@/lib/admin-api/index';
import {
  AdminButton,
  AdminLoadingState,
  PageHeader,
} from '@/components/admin';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

import { ContractAdjustDialog, ContractForm, ContractTerminateDialog } from '../../components/agents/contract/contract-dialogs';
import { formatDate, formatDateTime, formatInteger, formatPercent, formatUsd } from '../../components/agents/contract/contractFormat';

export const Route = createFileRoute('/agents/$agentId/contract/')({
  component: AgentContractIndexRoute,
});

const PAGE_SIZE = 20;
const LIVE_REFETCH_INTERVAL_MS = 5_000;

function AgentContractIndexRoute() {
  const { agentId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [terminateDialogOpen, setTerminateDialogOpen] = useState(false);
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
  });
  const [contractForm, setContractForm] = useState<ContractForm | null>(null);
  const stepsQuery = useInfiniteQuery({
    queryKey: ['admin', 'agent', agentId, 'execution-steps'],
    queryFn: ({ pageParam }) => getAgentExecutionSteps(agentId, PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.hasMore ? lastPageParam + PAGE_SIZE : undefined,
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
  });
  const mutation = useMutation({
    mutationFn: async (input: ContractForm) => {
      if (input.action === 'top-up') {
        return topUpAgentContract({
          agentId,
          amountUsd: input.amountUsd,
        });
      }

      if (input.action === 'renew') {
        return renewAgentContract({
          agentId,
          newBudgetUsd: input.amountUsd,
        });
      }

      return adjustAgentContractBudget({
        agentId,
        newBudgetUsd: input.amountUsd,
      });
    },
    onMutate: ({ action }) =>
      startAdminAction(action === 'top-up' ? 'Adicionando saldo...' : 'Ajustando contrato...'),
    onSuccess: async (_data, variables, context) => {
      succeedAdminAction(
        context,
        variables.action === 'top-up' ? 'Saldo adicionado ao contrato.' : 'Contrato atualizado.',
      );
      setDialogOpen(false);
      setContractForm(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId, 'execution-steps'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance-contracts'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const terminateMutation = useMutation({
    mutationFn: async () => terminateAgent(agentId),
    onMutate: () => startAdminAction('Demitindo agente...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Agente demitido.');
      setTerminateDialogOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'finance-contracts'] }),
      ]);
      await navigate({ to: '/agents' });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
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
      {agentQuery.isLoading && !agentQuery.data ? <AdminLoadingState label="Carregando contrato..." /> : null}
      <section className="space-y-5">
        <PageHeader
          title="Contrato"
          actions={
            activeContract ? (
              <>
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
                <AdminButton variant="destructive" onClick={() => setTerminateDialogOpen(true)}>
                  Demitir
                </AdminButton>
              </>
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

      <ContractAdjustDialog
        open={dialogOpen}
        pending={mutation.isPending}
        form={contractForm}
        onOpenChange={(open) => {
          setDialogOpen(open);

          if (!open) {
            setContractForm(null);
          }
        }}
        onFormChange={setContractForm}
        onSubmit={() => {
          if (contractForm) {
            mutation.mutate(contractForm);
          }
        }}
      />

      <ContractTerminateDialog
        open={terminateDialogOpen}
        pending={terminateMutation.isPending}
        errorMessage={terminateMutation.error?.message}
        onOpenChange={setTerminateDialogOpen}
        onConfirm={() => terminateMutation.mutate()}
      />
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

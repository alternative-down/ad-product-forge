import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  terminateAgent,
  adjustAgentContractBudget,
  getAgent,
  getAgentExecutionSteps,
  topUpAgentContract,
} from '@/lib/admin-api';
import {
  AdminDialogBody,
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [terminateDialogOpen, setTerminateDialogOpen] = useState(false);
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
  const terminateMutation = useMutation({
    mutationFn: async () => terminateAgent(agentId),
    onSuccess: async () => {
      setTerminateDialogOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'agents'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'finance-contracts'] }),
      ]);
      await navigate({ to: '/agents' });
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

      {terminateMutation.error ? <div className="text-sm text-destructive">{terminateMutation.error.message}</div> : null}

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
              className="flex flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate(contractForm);
              }}
            >
              <AdminDialogBody>
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
                      <SelectValue>
                        {contractForm.action === 'top-up' ? 'Adicionar saldo' : 'Ajustar orçamento'}
                      </SelectValue>
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
              </AdminDialogBody>

              <AdminDialogFooter>
                <AdminButton type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Salvando...' : 'Salvar'}
                </AdminButton>
              </AdminDialogFooter>
            </form>
          ) : null}
        </AdminDialogContent>
      </Dialog>

      <Dialog open={terminateDialogOpen} onOpenChange={setTerminateDialogOpen}>
        <AdminDialogContent>
          <AdminDialogHeader>
            <AdminDialogTitle>Demitir agente</AdminDialogTitle>
          </AdminDialogHeader>

          <div className="flex min-h-0 flex-1 flex-col">
            <AdminDialogBody>
              <div className="flex items-start gap-3 rounded-sm border border-border bg-muted/30 px-4 py-4">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="space-y-2 text-sm text-foreground">
                  <div>Esta ação encerra o agente agora.</div>
                  <div>O saldo restante do contrato atual será estornado como entrada no caixa da empresa.</div>
                </div>
              </div>
            </AdminDialogBody>

            <AdminDialogFooter>
              <AdminButton variant="ghost" onClick={() => setTerminateDialogOpen(false)} disabled={terminateMutation.isPending}>
                Cancelar
              </AdminButton>
              <AdminButton variant="destructive" onClick={() => terminateMutation.mutate()} disabled={terminateMutation.isPending}>
                {terminateMutation.isPending ? 'Demitindo...' : 'Confirmar'}
              </AdminButton>
            </AdminDialogFooter>
          </div>
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

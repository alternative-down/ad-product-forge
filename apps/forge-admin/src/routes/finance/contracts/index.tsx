import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState } from 'react';

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
import {
  adjustAgentContractBudget,
  getFinanceContracts,
  topUpAgentContract,
  type FinanceContractsResponse,
} from '@/lib/admin-api';

export const Route = createFileRoute('/finance/contracts/')({
  component: FinanceContractsIndexRoute,
});

type ContractForm = {
  agentId: string;
  agentName: string;
  action: 'adjust-budget' | 'top-up';
  amountUsd: number;
};

function createContractForm(contract: FinanceContractsResponse['items'][number]): ContractForm {
  return {
    agentId: contract.agentId,
    agentName: contract.agentName,
    action: 'adjust-budget',
    amountUsd: contract.weeklyValueUsd,
  };
}

function FinanceContractsIndexRoute() {
  const queryClient = useQueryClient();
  const contractsQuery = useQuery({
    queryKey: ['admin', 'finance-contracts'],
    queryFn: getFinanceContracts,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [contractForm, setContractForm] = useState<ContractForm | null>(null);
  const mutation = useMutation({
    mutationFn: async (input: ContractForm) => {
      if (input.action === 'top-up') {
        return topUpAgentContract({
          agentId: input.agentId,
          amountUsd: input.amountUsd,
        });
      }

      return adjustAgentContractBudget({
        agentId: input.agentId,
        newBudgetUsd: input.amountUsd,
      });
    },
    onSuccess: async () => {
      setDialogOpen(false);
      setContractForm(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance-contracts'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
    },
  });
  const contracts = contractsQuery.data?.items ?? [];

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="Contratos" />

      <section className="space-y-5">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Contratos ativos</div>
        </div>

        <div className="w-full min-w-0 overflow-hidden rounded-sm border border-border">
          <Table className="text-sm">
            <TableHeader className="bg-muted/50 text-left text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 py-3 font-medium">Nome</TableHead>
                <TableHead className="px-4 py-3 font-medium">Valor semanal</TableHead>
                <TableHead className="px-4 py-3 font-medium">Início</TableHead>
                <TableHead className="px-4 py-3 font-medium">Fim</TableHead>
                <TableHead className="px-4 py-3 font-medium">Renovação</TableHead>
                <TableHead className="px-4 py-3 text-right font-medium">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((contract) => (
                <TableRow key={contract.contractId}>
                  <TableCell className="px-4 py-3">{contract.agentName}</TableCell>
                  <TableCell className="px-4 py-3">{formatUsd(contract.weeklyValueUsd)}</TableCell>
                  <TableCell className="px-4 py-3">{formatDate(contract.startsAt)}</TableCell>
                  <TableCell className="px-4 py-3">{formatDate(contract.endsAt)}</TableCell>
                  <TableCell className="px-4 py-3">
                    {contract.autoRenew ? 'Automática' : 'Manual'}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <AdminButton
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setContractForm(createContractForm(contract));
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Editar</span>
                      </AdminButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {contracts.length === 0 ? (
                <TableRow>
                  <TableCell className="px-4 py-6 text-muted-foreground" colSpan={6}>
                    Nenhum contrato ativo agora.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        {contractsQuery.error ? <div className="text-sm text-destructive">{contractsQuery.error.message}</div> : null}
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
            <AdminDialogTitle>{contractForm ? `Alterar contrato · ${contractForm.agentName}` : 'Alterar contrato'}</AdminDialogTitle>
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
                  <label className="text-sm font-medium" htmlFor="finance-contract-action">
                    Ação
                  </label>
                  <Select
                    value={contractForm.action}
                    onValueChange={(value: ContractForm['action']) =>
                      setContractForm((current) => (current ? { ...current, action: value } : current))
                    }
                    disabled={mutation.isPending}
                  >
                    <SelectTrigger id="finance-contract-action" className="w-full">
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
                  <label className="text-sm font-medium" htmlFor="finance-contract-amount">
                    {contractForm.action === 'top-up' ? 'Valor adicional' : 'Novo valor semanal'}
                  </label>
                  <AdminInput
                    id="finance-contract-amount"
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

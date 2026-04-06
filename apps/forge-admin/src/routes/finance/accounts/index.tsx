import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import {
  AdminButton,
  AdminLoadingState,
  PageHeader,
} from '@/components/admin';
import {
  cancelPlannedLedgerEntry,
  createInvestment,
  createPayable,
  getFinance,
  getFinanceContracts,
  postPlannedLedgerEntry,
  setRecurringPayableActive,
} from '@/lib/admin-api';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

import {
  formatDate,
  formatDateTime,
  formatUsd,
  formatUsdSigned,
  humanizeMovementType,
  humanizeRecurrencePeriod,
} from './-finance-accounts-format';
import { createEmptyMovementForm, toPayableInput, type MovementForm } from './-finance-accounts-types';
import { MovementAgendaTable } from './-movement-agenda-table';
import { MovementDialog } from './-movement-dialog';
import { MovementsTable } from './-movements-table';

export const Route = createFileRoute('/finance/accounts/')({
  component: FinanceAccountsIndexRoute,
});

function FinanceAccountsIndexRoute() {
  const queryClient = useQueryClient();
  const financeQuery = useQuery({
    queryKey: ['admin', 'finance'],
    queryFn: getFinance,
  });
  const contractsQuery = useQuery({
    queryKey: ['admin', 'finance-contracts'],
    queryFn: getFinanceContracts,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [movementForm, setMovementForm] = useState<MovementForm>(createEmptyMovementForm);
  const createMutation = useMutation({
    mutationFn: async (input: MovementForm) => {
      if (input.kind === 'single' && input.direction === 'in') {
        return createInvestment({
          amountUsd: input.amountUsd,
          description: input.description.trim() || input.name.trim() || undefined,
          effectiveAt: input.date || undefined,
        });
      }

      return createPayable(toPayableInput(input));
    },
    onMutate: () => startAdminAction('Salvando movimento...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Movimento salvo.');
      setDialogOpen(false);
      setMovementForm(createEmptyMovementForm());
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance-contracts'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const postMutation = useMutation({
    mutationFn: ({ entryId, effectiveAt }: { entryId: string; effectiveAt?: string }) =>
      postPlannedLedgerEntry(entryId, effectiveAt),
    onMutate: () => startAdminAction('Postando movimento...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Movimento postado.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const cancelMutation = useMutation({
    mutationFn: cancelPlannedLedgerEntry,
    onMutate: () => startAdminAction('Cancelando movimento...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Movimento cancelado.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const recurringMutation = useMutation({
    mutationFn: ({ payableId, isActive }: { payableId: string; isActive: boolean }) =>
      setRecurringPayableActive(payableId, isActive),
    onMutate: ({ isActive }) => startAdminAction(isActive ? 'Ativando recorrência...' : 'Inativando recorrência...'),
    onSuccess: async (_data, variables, context) => {
      succeedAdminAction(context, variables.isActive ? 'Recorrência ativada.' : 'Recorrência inativada.');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
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
  const recurringContracts = useMemo(
    () => contractsQuery.data?.items ?? [],
    [contractsQuery.data?.items],
  );
  const movements = useMemo(
    () => financeQuery.data?.movements.items ?? [],
    [financeQuery.data?.movements.items],
  );
  const agendaRows = useMemo(
    () => [
      ...plannedMovements.map((movement) => ({
        kind: 'planned' as const,
        id: movement.id,
        name: humanizeMovementType(movement.type),
        amountLabel: formatUsdSigned(movement.amountUsd, movement.direction),
        dateLabel: formatDateTime(movement.dueAt ?? movement.createdAt),
        typeLabel: 'Previsto',
        statusLabel: 'Pendente',
      })),
      ...recurringPayables.map((payable) => ({
        kind: 'recurring-payable' as const,
        id: payable.payableId,
        name: payable.name,
        amountLabel: formatUsd(payable.amountUsd),
        dateLabel: formatDateTime(payable.nextDueAt),
        typeLabel: humanizeRecurrencePeriod(payable.recurrencePeriod),
        statusLabel: payable.isActive ? 'Ativo' : 'Inativo',
        isActive: payable.isActive,
      })),
      ...recurringContracts.map((contract) => ({
        kind: 'contract' as const,
        id: contract.contractId,
        name: contract.agentName,
        amountLabel: formatUsd(contract.weeklyValueUsd),
        dateLabel: formatDate(contract.endsAt),
        typeLabel: 'Contrato semanal',
        statusLabel: contract.autoRenew ? 'Renova automaticamente' : 'Sem renovação',
      })),
    ],
    [plannedMovements, recurringContracts, recurringPayables],
  );

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {financeQuery.isLoading && !financeQuery.data ? <AdminLoadingState label="Carregando contas..." /> : null}
      <PageHeader title="Contas a pagar/receber" />

      <section className="space-y-5">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Movimentos</div>
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

        <MovementsTable movements={movements} />
      </section>

      <section className="space-y-5">
        <div className="space-y-1">
          <div className="text-lg font-semibold tracking-[-0.03em]">Agenda de movimentos</div>
        </div>

        <MovementAgendaTable
          rows={agendaRows}
          pending={postMutation.isPending || cancelMutation.isPending || recurringMutation.isPending}
          onPost={(entryId) => postMutation.mutate({ entryId })}
          onCancel={(entryId) => cancelMutation.mutate(entryId)}
          onToggleRecurring={(payableId, isActive) => recurringMutation.mutate({ payableId, isActive })}
        />

        {financeQuery.error ? <div className="text-sm text-destructive">{financeQuery.error.message}</div> : null}
        {contractsQuery.error ? <div className="text-sm text-destructive">{contractsQuery.error.message}</div> : null}
        {postMutation.error ? <div className="text-sm text-destructive">{postMutation.error.message}</div> : null}
        {cancelMutation.error ? <div className="text-sm text-destructive">{cancelMutation.error.message}</div> : null}
        {recurringMutation.error ? <div className="text-sm text-destructive">{recurringMutation.error.message}</div> : null}
      </section>

      <MovementDialog
        open={dialogOpen}
        pending={createMutation.isPending}
        form={movementForm}
        onOpenChange={setDialogOpen}
        onFormChange={setMovementForm}
        onSubmit={() => createMutation.mutate(movementForm)}
      />
    </div>
  );
}

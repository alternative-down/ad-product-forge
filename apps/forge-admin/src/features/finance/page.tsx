import { type ReactNode, useState } from 'react';
import { CircleDollarSign, LoaderCircle, Repeat, ReceiptText } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  cancelPlannedLedgerEntry,
  createInvestment,
  createPayable,
  getFinance,
  postPlannedLedgerEntry,
  setRecurringPayableActive,
} from '../../lib/api';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { formatDateTime, formatUsd } from '../../lib/format';

type InvestmentDraft = {
  amountUsd: string;
  description: string;
  effectiveAt: string;
};

type SinglePayableDraft = {
  name: string;
  description: string;
  amountUsd: string;
  dueAt: string;
};

type RecurringPayableDraft = {
  name: string;
  description: string;
  amountUsd: string;
  dueAt: string;
  recurrencePeriod: 'weekly' | 'monthly' | 'yearly';
};

export function FinancePage() {
  const queryClient = useQueryClient();
  const financeQuery = useQuery({
    queryKey: ['admin', 'finance'],
    queryFn: getFinance,
  });
  const investmentMutation = useMutation({
    mutationFn: createInvestment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
  const payableMutation = useMutation({
    mutationFn: createPayable,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
  const postEntryMutation = useMutation({
    mutationFn: ({ entryId, effectiveAt }: { entryId: string; effectiveAt?: string }) =>
      postPlannedLedgerEntry(entryId, effectiveAt),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
  const cancelEntryMutation = useMutation({
    mutationFn: cancelPlannedLedgerEntry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
  const recurringMutation = useMutation({
    mutationFn: ({ payableId, isActive }: { payableId: string; isActive: boolean }) =>
      setRecurringPayableActive(payableId, isActive),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
    },
  });

  if (financeQuery.isLoading) {
    return <PanelLoading label="Loading finance" />;
  }

  if (financeQuery.isError) {
    return <PanelError message={financeQuery.error.message} />;
  }

  const finance = financeQuery.data!;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Cash balance" value={formatUsd(finance.balanceUsd)} />
        <MetricCard label="Total in" value={formatUsd(finance.summary.totalInUsd)} />
        <MetricCard label="Total out" value={formatUsd(finance.summary.totalOutUsd)} />
        <MetricCard label="Scheduled out" value={formatUsd(finance.summary.scheduledOutUsd)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <InvestmentCard
          pending={investmentMutation.isPending}
          error={investmentMutation.error?.message ?? null}
          onSubmit={(input) => investmentMutation.mutate(input)}
        />
        <PayableCard
          pending={payableMutation.isPending}
          error={payableMutation.error?.message ?? null}
          onSubmit={(input) => payableMutation.mutate(input)}
        />
      </div>

      <RecurringPayablesCard
        items={finance.recurringPayables}
        pendingPayableId={recurringMutation.variables?.payableId}
        pending={recurringMutation.isPending}
        error={recurringMutation.error?.message ?? null}
        onToggle={(payableId, isActive) => recurringMutation.mutate({ payableId, isActive })}
      />

      <LedgerCard
        items={finance.movements.items}
        pendingPostEntryId={postEntryMutation.variables?.entryId}
        pendingCancelEntryId={cancelEntryMutation.variables}
        postPending={postEntryMutation.isPending}
        cancelPending={cancelEntryMutation.isPending}
        error={postEntryMutation.error?.message ?? cancelEntryMutation.error?.message ?? null}
        onPost={(entryId) => postEntryMutation.mutate({ entryId })}
        onCancel={(entryId) => cancelEntryMutation.mutate(entryId)}
      />
    </div>
  );
}

function InvestmentCard(input: {
  pending: boolean;
  error: string | null;
  onSubmit(input: { amountUsd: number; description?: string; effectiveAt?: string }): void;
}) {
  const [draft, setDraft] = useState<InvestmentDraft>({
    amountUsd: '',
    description: '',
    effectiveAt: '',
  });

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Owner investment</h2>
          <p className="mt-1 text-sm text-slate-500">
            Records a capital injection explicitly as investment instead of mutating cash directly.
          </p>
        </div>
        <CircleDollarSign className="h-5 w-5 text-slate-500" />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <LabeledField label="Amount (USD)">
          <Input
            value={draft.amountUsd}
            onChange={(event) => setDraft((current) => ({ ...current, amountUsd: event.target.value }))}
            placeholder="1000"
          />
        </LabeledField>
        <LabeledField label="Effective at">
          <Input
            type="datetime-local"
            value={draft.effectiveAt}
            onChange={(event) => setDraft((current) => ({ ...current, effectiveAt: event.target.value }))}
          />
        </LabeledField>
        <LabeledField label="Description">
          <Input
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            placeholder="Founder cash injection"
          />
        </LabeledField>
      </div>
      <div className="mt-5 flex gap-3">
        <Button
          type="button"
          disabled={input.pending || !draft.amountUsd.trim()}
          onClick={() =>
            input.onSubmit({
              amountUsd: Number(draft.amountUsd),
              description: draft.description || undefined,
              effectiveAt: draft.effectiveAt || undefined,
            })
          }
        >
          Register investment
        </Button>
      </div>
      {input.error ? <ErrorBanner message={input.error} /> : null}
    </Card>
  );
}

function PayableCard(input: {
  pending: boolean;
  error: string | null;
  onSubmit(
    input:
      | { kind: 'single'; name: string; description?: string; amountUsd: number; dueAt: string }
      | { kind: 'recurring'; name: string; description?: string; amountUsd: number; dueAt: string; recurrencePeriod: 'weekly' | 'monthly' | 'yearly' },
  ): void;
}) {
  const [mode, setMode] = useState<'single' | 'recurring'>('single');
  const [singleDraft, setSingleDraft] = useState<SinglePayableDraft>({
    name: '',
    description: '',
    amountUsd: '',
    dueAt: '',
  });
  const [recurringDraft, setRecurringDraft] = useState<RecurringPayableDraft>({
    name: '',
    description: '',
    amountUsd: '',
    dueAt: '',
    recurrencePeriod: 'monthly',
  });

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Accounts payable</h2>
          <p className="mt-1 text-sm text-slate-500">
            Creates planned cash-out entries for one-off or recurring vendor obligations.
          </p>
        </div>
        <ReceiptText className="h-5 w-5 text-slate-500" />
      </div>
      <div className="mt-5 flex gap-2">
        <Button type="button" variant={mode === 'single' ? 'primary' : 'secondary'} onClick={() => setMode('single')}>
          Single
        </Button>
        <Button type="button" variant={mode === 'recurring' ? 'primary' : 'secondary'} onClick={() => setMode('recurring')}>
          Recurring
        </Button>
      </div>

      {mode === 'single' ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <LabeledField label="Name">
            <Input value={singleDraft.name} onChange={(event) => setSingleDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Hetzner VPS" />
          </LabeledField>
          <LabeledField label="Amount (USD)">
            <Input value={singleDraft.amountUsd} onChange={(event) => setSingleDraft((current) => ({ ...current, amountUsd: event.target.value }))} placeholder="29.90" />
          </LabeledField>
          <LabeledField label="Due at">
            <Input type="datetime-local" value={singleDraft.dueAt} onChange={(event) => setSingleDraft((current) => ({ ...current, dueAt: event.target.value }))} />
          </LabeledField>
          <LabeledField label="Description">
            <Input value={singleDraft.description} onChange={(event) => setSingleDraft((current) => ({ ...current, description: event.target.value }))} placeholder="March hosting invoice" />
          </LabeledField>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <LabeledField label="Name">
            <Input value={recurringDraft.name} onChange={(event) => setRecurringDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Coolify server" />
          </LabeledField>
          <LabeledField label="Amount (USD)">
            <Input value={recurringDraft.amountUsd} onChange={(event) => setRecurringDraft((current) => ({ ...current, amountUsd: event.target.value }))} placeholder="10" />
          </LabeledField>
          <LabeledField label="First due at">
            <Input type="datetime-local" value={recurringDraft.dueAt} onChange={(event) => setRecurringDraft((current) => ({ ...current, dueAt: event.target.value }))} />
          </LabeledField>
          <LabeledField label="Recurrence">
            <select
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
              value={recurringDraft.recurrencePeriod}
              onChange={(event) =>
                setRecurringDraft((current) => ({
                  ...current,
                  recurrencePeriod: event.target.value as 'weekly' | 'monthly' | 'yearly',
                }))
              }
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </LabeledField>
          <LabeledField label="Description">
            <Input value={recurringDraft.description} onChange={(event) => setRecurringDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Monthly infrastructure invoice" />
          </LabeledField>
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <Button
          type="button"
          disabled={
            input.pending
            || (mode === 'single'
              ? !singleDraft.name.trim() || !singleDraft.amountUsd.trim() || !singleDraft.dueAt.trim()
              : !recurringDraft.name.trim() || !recurringDraft.amountUsd.trim() || !recurringDraft.dueAt.trim())
          }
          onClick={() => {
            if (mode === 'single') {
              input.onSubmit({
                kind: 'single',
                name: singleDraft.name,
                description: singleDraft.description || undefined,
                amountUsd: Number(singleDraft.amountUsd),
                dueAt: singleDraft.dueAt,
              });
              return;
            }

            input.onSubmit({
              kind: 'recurring',
              name: recurringDraft.name,
              description: recurringDraft.description || undefined,
              amountUsd: Number(recurringDraft.amountUsd),
              dueAt: recurringDraft.dueAt,
              recurrencePeriod: recurringDraft.recurrencePeriod,
            });
          }}
        >
          Create payable
        </Button>
      </div>
      {input.error ? <ErrorBanner message={input.error} /> : null}
    </Card>
  );
}

function RecurringPayablesCard(input: {
  items: Array<{
    payableId: string;
    name: string;
    description?: string;
    amountUsd: number;
    recurrencePeriod: 'weekly' | 'monthly' | 'yearly';
    nextDueAt: number;
    isActive: boolean;
    createdAt: number;
    updatedAt: number;
  }>;
  pendingPayableId?: string;
  pending: boolean;
  error: string | null;
  onToggle(payableId: string, isActive: boolean): void;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Recurring payables</h2>
          <p className="mt-1 text-sm text-slate-500">
            Active recurring plans generate the next planned ledger entry whenever the current one is posted or canceled.
          </p>
        </div>
        <Repeat className="h-5 w-5 text-slate-500" />
      </div>
      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Recurrence</th>
              <th className="px-4 py-3 font-medium">Next due</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
            {input.items.map((item) => (
              <tr key={item.payableId}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-950">{item.name}</div>
                  <div className="text-xs text-slate-500">{item.description ?? 'No description'}</div>
                </td>
                <td className="px-4 py-3">{formatUsd(item.amountUsd)}</td>
                <td className="px-4 py-3 capitalize">{item.recurrencePeriod}</td>
                <td className="px-4 py-3">{formatDateTime(item.nextDueAt)}</td>
                <td className="px-4 py-3">
                  <label className="flex items-center gap-2">
                    {input.pending && input.pendingPayableId === item.payableId ? (
                      <LoaderCircle className="h-4 w-4 animate-spin text-slate-500" />
                    ) : null}
                    <input
                      type="checkbox"
                      checked={item.isActive}
                      onChange={(event) => input.onToggle(item.payableId, event.target.checked)}
                    />
                    {item.isActive ? 'Active' : 'Paused'}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {input.error ? <ErrorBanner message={input.error} /> : null}
    </Card>
  );
}

function LedgerCard(input: {
  items: Array<{
    id: string;
    type: string;
    direction: 'in' | 'out';
    amountUsd: number;
    description?: string;
    status: string;
    dueAt?: number;
    effectiveAt?: number;
    createdAt: number;
  }>;
  pendingPostEntryId?: string;
  pendingCancelEntryId?: string;
  postPending: boolean;
  cancelPending: boolean;
  error: string | null;
  onPost(entryId: string): void;
  onCancel(entryId: string): void;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Ledger</h2>
          <p className="mt-1 text-sm text-slate-500">
            Planned entries can be posted or canceled directly from the maintenance console.
          </p>
        </div>
      </div>
      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
            {input.items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-950">{item.type}</div>
                  <div className="text-xs text-slate-500">{item.description ?? 'No description'}</div>
                </td>
                <td className="px-4 py-3">{formatUsd(item.amountUsd)}</td>
                <td className="px-4 py-3 capitalize">{item.status}</td>
                <td className="px-4 py-3">{formatDateTime(item.effectiveAt ?? item.dueAt ?? item.createdAt)}</td>
                <td className="px-4 py-3">
                  {item.status === 'planned' ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        disabled={input.postPending || input.cancelPending}
                        onClick={() => input.onPost(item.id)}
                      >
                        {input.postPending && input.pendingPostEntryId === item.id ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : null}
                        Post
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={input.postPending || input.cancelPending}
                        onClick={() => input.onCancel(item.id)}
                      >
                        {input.cancelPending && input.pendingCancelEntryId === item.id ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : null}
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {input.error ? <ErrorBanner message={input.error} /> : null}
    </Card>
  );
}

function MetricCard(input: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <div className="text-sm font-medium text-slate-500">{input.label}</div>
      <div className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">{input.value}</div>
    </Card>
  );
}

function LabeledField(input: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm text-slate-600">
      <span className="font-medium text-slate-700">{input.label}</span>
      {input.children}
    </label>
  );
}

function ErrorBanner(input: { message: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {input.message}
    </div>
  );
}

function PanelLoading(input: { label: string }) {
  return <Card className="p-6 text-sm text-slate-600">{input.label}</Card>;
}

function PanelError(input: { message: string }) {
  return <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{input.message}</Card>;
}

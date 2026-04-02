import { type ReactNode, useState } from 'react';
import { CircleDollarSign, LoaderCircle, Repeat, ReceiptText } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';

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
import { PageHeader } from '../../components/layout/page-header';
import { SectionNav, WorkspaceCanvas } from '../../components/layout/section-nav';

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
  return <FinanceWorkspacePage mode="directory" />;
}

export function FinanceDetailPage(input: {
  section: 'capital' | 'payables' | 'recurring' | 'ledger';
}) {
  return <FinanceWorkspacePage mode="detail" section={input.section} />;
}

function FinanceWorkspacePage(input: {
  mode: 'directory' | 'detail';
  section?: 'capital' | 'payables' | 'recurring' | 'ledger';
}) {
  const navigate = useNavigate();
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
  const selectedSection = input.section ?? 'capital';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Capital movement and obligations"
        description="Capital events, payable scheduling, recurring liabilities, and ledger posting. One financial task at a time."
        actions={
          input.mode === 'detail' ? (
            <Link
              to="/v1/finance"
              className="inline-flex h-11 items-center justify-center rounded-md border border-[color:var(--panel-border-strong)] bg-[color:var(--panel-strong)] px-5 text-sm font-semibold text-[color:var(--ink)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
            >
              Back to finance
            </Link>
          ) : null
        }
      />

      {input.mode === 'directory' ? (
        <WorkspaceCanvas
          title="Finance areas"
          description="Open one financial workflow at a time: capital, payables, recurring obligations, or ledger posting."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FinanceEntryLink
              to="/v1/finance/capital"
              title="Capital"
              detail={`balance ${formatUsd(finance.balanceUsd)}`}
              metric={`scheduled out ${formatUsd(finance.summary.scheduledOutUsd)}`}
            />
            <FinanceEntryLink
              to="/v1/finance/payables"
              title="Payables"
              detail="Create one-off and recurring obligations"
              metric={`${finance.recurringPayables.length} recurring plans`}
            />
            <FinanceEntryLink
              to="/v1/finance/recurring"
              title="Recurring"
              detail={`${finance.recurringPayables.length} recurring obligations`}
              metric={`${finance.recurringPayables.filter((item) => item.isActive).length} active`}
            />
            <FinanceEntryLink
              to="/v1/finance/ledger"
              title="Ledger"
              detail={`${finance.movements.items.length} planned and posted rows`}
              metric={`${finance.movements.items.filter((item) => item.status === 'planned').length} planned`}
            />
          </div>
        </WorkspaceCanvas>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
          <SectionNav
            title="Finance area"
            value={selectedSection}
            items={[
              { value: 'capital', label: 'Capital', detail: `balance ${formatUsd(finance.balanceUsd)}` },
              { value: 'payables', label: 'Payables', detail: 'create one-off and recurring obligations' },
              { value: 'recurring', label: 'Recurring', detail: `${finance.recurringPayables.length} recurring obligations` },
              { value: 'ledger', label: 'Ledger', detail: `${finance.movements.items.length} planned and posted rows` },
            ]}
            onChange={(nextSection) => void navigate(buildFinanceLocation(nextSection))}
          />

          <div className="space-y-6">
          {selectedSection === 'capital' ? (
            <WorkspaceCanvas
              title="Capital injection"
              description="Register owner capital intentionally instead of mutating balance directly."
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MiniMetric label="Cash balance" value={formatUsd(finance.balanceUsd)} />
                <MiniMetric label="Total in" value={formatUsd(finance.summary.totalInUsd)} />
                <MiniMetric label="Total out" value={formatUsd(finance.summary.totalOutUsd)} />
                <MiniMetric label="Scheduled out" value={formatUsd(finance.summary.scheduledOutUsd)} />
              </div>
              <div className="mt-6 max-w-4xl">
                <InvestmentCard
                  pending={investmentMutation.isPending}
                  error={investmentMutation.error?.message ?? null}
                  onSubmit={(input) => investmentMutation.mutate(input)}
                />
              </div>
            </WorkspaceCanvas>
          ) : null}

          {selectedSection === 'payables' ? (
            <div className="space-y-6">
              <WorkspaceCanvas
                title="Payables status"
                description="One-off and recurring obligations that will affect the company ledger."
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MiniMetric label="Recurring plans" value={String(finance.recurringPayables.length)} />
                  <MiniMetric label="Scheduled out" value={formatUsd(finance.summary.scheduledOutUsd)} />
                  <MiniMetric label="Ledger rows" value={String(finance.movements.items.length)} />
                  <MiniMetric label="Balance" value={formatUsd(finance.balanceUsd)} />
                </div>
              </WorkspaceCanvas>

              <WorkspaceCanvas
                title="Create payable"
                description="Create a single planned payable or define a recurring liability."
              >
                <div className="max-w-5xl">
                  <PayableCard
                    pending={payableMutation.isPending}
                    error={payableMutation.error?.message ?? null}
                    onSubmit={(input) => payableMutation.mutate(input)}
                  />
                </div>
              </WorkspaceCanvas>
            </div>
          ) : null}

          {selectedSection === 'recurring' ? (
            <div className="space-y-6">
              <WorkspaceCanvas
                title="Recurring status"
                description="Recurring obligations and their next due moments."
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MiniMetric
                    label="Active"
                    value={String(finance.recurringPayables.filter((item) => item.isActive).length)}
                  />
                  <MiniMetric
                    label="Paused"
                    value={String(finance.recurringPayables.filter((item) => !item.isActive).length)}
                  />
                  <MiniMetric
                    label="Next due"
                    value={
                      finance.recurringPayables[0]
                        ? formatDateTime(
                            [...finance.recurringPayables]
                              .sort((left, right) => left.nextDueAt - right.nextDueAt)[0].nextDueAt,
                          )
                        : '—'
                    }
                  />
                  <MiniMetric label="Rows" value={String(finance.recurringPayables.length)} />
                </div>
              </WorkspaceCanvas>

              <WorkspaceCanvas
                title="Recurring obligations"
                description="Pause or resume recurring payables without losing their history."
              >
                <RecurringPayablesCard
                  items={finance.recurringPayables}
                  pendingPayableId={recurringMutation.variables?.payableId}
                  pending={recurringMutation.isPending}
                  error={recurringMutation.error?.message ?? null}
                  onToggle={(payableId, isActive) => recurringMutation.mutate({ payableId, isActive })}
                />
              </WorkspaceCanvas>
            </div>
          ) : null}

          {selectedSection === 'ledger' ? (
            <div className="space-y-6">
              <WorkspaceCanvas
                title="Ledger status"
                description="Recent financial rows and how many still require posting decisions."
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MiniMetric
                    label="Planned"
                    value={String(finance.movements.items.filter((item) => item.status === 'planned').length)}
                  />
                  <MiniMetric
                    label="Posted"
                    value={String(finance.movements.items.filter((item) => item.status === 'posted').length)}
                  />
                  <MiniMetric
                    label="Canceled"
                    value={String(finance.movements.items.filter((item) => item.status === 'canceled').length)}
                  />
                  <MiniMetric label="Rows" value={String(finance.movements.items.length)} />
                </div>
              </WorkspaceCanvas>

              <WorkspaceCanvas
                title="Ledger posting"
                description="Post or cancel planned entries from the financial timeline."
              >
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
              </WorkspaceCanvas>
            </div>
          ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function FinanceEntryLink(input: {
  to: '/v1/finance/capital' | '/v1/finance/payables' | '/v1/finance/recurring' | '/v1/finance/ledger';
  title: string;
  detail: string;
  metric: string;
}) {
  return (
    <Link
      to={input.to}
      className="rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel-strong)] px-5 py-5 transition hover:border-[color:var(--panel-border-strong)] hover:bg-[color:var(--panel)]"
      >
      <div className="text-lg font-semibold text-[color:var(--ink)]">{input.title}</div>
      <div className="mt-2 text-sm text-[color:var(--muted)]">{input.detail}</div>
      <div className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
        {input.metric}
      </div>
    </Link>
  );
}

function buildFinanceLocation(section: 'capital' | 'payables' | 'recurring' | 'ledger') {
  if (section === 'payables') {
    return { to: '/v1/finance/payables' as const };
  }

  if (section === 'recurring') {
    return { to: '/v1/finance/recurring' as const };
  }

  if (section === 'ledger') {
    return { to: '/v1/finance/ledger' as const };
  }

  return { to: '/v1/finance/capital' as const };
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
          <h2 className="text-lg font-semibold text-foreground">Owner investment</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Records a capital injection explicitly as investment instead of mutating cash directly.
          </p>
        </div>
        <CircleDollarSign className="h-5 w-5 text-muted-foreground" />
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
          <h2 className="text-lg font-semibold text-foreground">Accounts payable</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Creates planned cash-out entries for one-off or recurring vendor obligations.
          </p>
        </div>
        <ReceiptText className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <MiniMetric
          label="Selected mode"
          value={mode === 'single' ? 'Single payable' : 'Recurring payable'}
        />
        <MiniMetric
          label="Effect"
          value={mode === 'single' ? 'Creates one planned row' : 'Creates a recurring obligation'}
        />
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
        <div className="mt-5 rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4">
          <div className="mb-4">
            <div className="text-sm font-semibold text-[color:var(--ink)]">Single payable</div>
            <div className="mt-1 text-sm text-[color:var(--muted)]">
              Create one planned obligation with a due date.
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
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
        </div>
      ) : (
        <div className="mt-5 rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4">
          <div className="mb-4">
            <div className="text-sm font-semibold text-[color:var(--ink)]">Recurring payable</div>
            <div className="mt-1 text-sm text-[color:var(--muted)]">
              Create a recurring obligation that will keep producing future planned rows.
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
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
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
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
          <h2 className="text-lg font-semibold text-foreground">Recurring payables</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Active recurring plans generate the next planned ledger entry whenever the current one is posted or canceled.
          </p>
        </div>
        <Repeat className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="mt-5 overflow-hidden rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border text-left text-sm">
          <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Recurrence</th>
              <th className="px-4 py-3 font-medium">Next due</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background text-muted-foreground">
            {input.items.map((item) => (
              <tr key={item.payableId}>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{item.name}</div>
                  <div className="text-xs text-muted-foreground">{item.description ?? 'No description'}</div>
                </td>
                <td className="px-4 py-3">{formatUsd(item.amountUsd)}</td>
                <td className="px-4 py-3 capitalize">{item.recurrencePeriod}</td>
                <td className="px-4 py-3">{formatDateTime(item.nextDueAt)}</td>
                <td className="px-4 py-3">
                  <label className="flex items-center gap-2">
                    {input.pending && input.pendingPayableId === item.payableId ? (
                      <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
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
          <h2 className="text-lg font-semibold text-foreground">Ledger</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Planned entries can be posted or canceled directly from the maintenance console.
          </p>
        </div>
      </div>
      <div className="mt-5 overflow-hidden rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border text-left text-sm">
          <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background text-muted-foreground">
            {input.items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{item.type}</div>
                  <div className="text-xs text-muted-foreground">{item.description ?? 'No description'}</div>
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

function MiniMetric(input: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted-strong)]">
        {input.label}
      </div>
      <div className="mt-2 text-sm font-semibold text-[color:var(--ink)]">{input.value}</div>
    </div>
  );
}

function LabeledField(input: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{input.label}</span>
      {input.children}
    </label>
  );
}

function ErrorBanner(input: { message: string }) {
  return (
    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {input.message}
    </div>
  );
}

function PanelLoading(input: { label: string }) {
  return <Card className="p-6 text-sm text-muted-foreground">{input.label}</Card>;
}

function PanelError(input: { message: string }) {
  return <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{input.message}</Card>;
}

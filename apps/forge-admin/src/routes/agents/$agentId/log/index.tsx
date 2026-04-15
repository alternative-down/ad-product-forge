import { createFileRoute } from '@tanstack/react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

import { PageHeader } from '@/components/admin';
import { getAgentRuntimeMemory, getAgentThreadMessages } from '@/lib/admin-api';

import { ThreadMessageArticle } from './-thread-message-content';

export const Route = createFileRoute('/agents/$agentId/log/')({
  component: AgentLogIndexRoute,
});

const PAGE_SIZE = 20;

function AgentLogIndexRoute() {
  const { agentId } = Route.useParams();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const runtimeMemoryQuery = useQuery({
    queryKey: ['admin', 'agent', agentId, 'runtime-memory'],
    queryFn: () => getAgentRuntimeMemory(agentId),
  });
  const messagesQuery = useInfiniteQuery({
    queryKey: ['admin', 'agent', agentId, 'thread-messages'],
    queryFn: ({ pageParam }) => getAgentThreadMessages(agentId, pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.hasMore ? lastPageParam + 1 : undefined,
  });
  const messages = messagesQuery.data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => {
    const target = sentinelRef.current;

    if (!target) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
        void messagesQuery.fetchNextPage();
      }
    });

    observer.observe(target);
    return () => observer.disconnect();
  }, [messagesQuery]);

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="Log" />

      <AgentRuntimeMemorySection
        workingMemory={runtimeMemoryQuery.data?.workingMemory ?? null}
        agentContext={runtimeMemoryQuery.data?.agentContext ?? null}
        executionState={runtimeMemoryQuery.data?.executionState ?? 'idle'}
        lastExecutionError={runtimeMemoryQuery.data?.lastExecutionError ?? null}
        lastExecutionErrorAt={runtimeMemoryQuery.data?.lastExecutionErrorAt ?? null}
        observations={runtimeMemoryQuery.data?.observations ?? null}
        reflection={runtimeMemoryQuery.data?.reflection ?? null}
        generationCount={runtimeMemoryQuery.data?.generationCount ?? null}
        updatedAt={runtimeMemoryQuery.data?.updatedAt ?? null}
        lastObservedAt={runtimeMemoryQuery.data?.lastObservedAt ?? null}
        checkpointGeneration={runtimeMemoryQuery.data?.checkpointGeneration ?? null}
        checkpointSummary={runtimeMemoryQuery.data?.checkpointSummary ?? null}
        checkpointUpdatedAt={runtimeMemoryQuery.data?.checkpointUpdatedAt ?? null}
        ltm={runtimeMemoryQuery.data?.ltm ?? null}
        metrics={runtimeMemoryQuery.data?.metrics ?? null}
        loading={runtimeMemoryQuery.isLoading}
        error={runtimeMemoryQuery.error?.message ?? null}
      />

      {messages.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum log ainda.</div> : null}

      {messages.map((message, index) => (
        <ThreadMessageArticle key={message.id} message={message} index={index} />
      ))}

      <div ref={sentinelRef} className="h-4" />
      {messagesQuery.isFetchingNextPage ? <div className="text-sm text-muted-foreground">Carregando mais...</div> : null}
      {messagesQuery.error ? <div className="text-sm text-destructive">{messagesQuery.error.message}</div> : null}
    </div>
  );
}

function AgentRuntimeMemorySection(input: {
  workingMemory: string | null;
  agentContext: string | null;
  executionState: 'idle' | 'running' | 'absent';
  lastExecutionError: string | null;
  lastExecutionErrorAt: number | null;
  observations: string | null;
  reflection: string | null;
  generationCount: number | null;
  updatedAt: number | null;
  lastObservedAt: number | null;
  checkpointGeneration: number | null;
  checkpointSummary: string | null;
  checkpointUpdatedAt: number | null;
  ltm: {
    running: boolean;
    queued: boolean;
    lastRunAt: number | null;
    lastRunError: string | null;
    lastRunErrorAt: number | null;
    lastWrittenPackageId: string | null;
    lastWrittenAt: number | null;
    packageCount: number;
  } | null;
  metrics: {
    rawMessageCount: number;
    recentRawMessageCount: number;
    recentRawTokenCount: number;
    recentRawTokenLimit: number;
    overflowMessageCount: number;
    overflowTokenCount: number;
    observationTriggerTokenLimit: number;
    activeObservationBlockCount: number;
    observationTokenCount: number;
    reflectionTriggerTokenLimit: number;
    activeReflectionBlockCount: number;
    reflectionTokenCount: number;
    reflectionBudget: number;
    checkpointTokenCount: number;
    checkpointSummaryUpToGeneration: number | null;
    latestThreadMessageAt: number | null;
  } | null;
  loading: boolean;
  error: string | null;
}) {
  if (input.loading) {
    return <div className="text-sm text-muted-foreground">Carregando memória do agente...</div>;
  }

  if (input.error) {
    return <div className="text-sm text-destructive">{input.error}</div>;
  }

  if (!input.workingMemory && !input.agentContext && !input.observations && !input.reflection) {
    if (!input.checkpointSummary) {
      return null;
    }
  }

  return (
    <section className="space-y-4 border-b border-border pb-6">
      <header className="space-y-1">
        <h2 className="text-sm font-medium text-foreground">Memória</h2>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {input.generationCount !== null ? <span>OM generation: {input.generationCount}</span> : null}
          {input.updatedAt ? <span>Atualizada: {formatDateTime(input.updatedAt)}</span> : null}
          {input.lastObservedAt ? <span>Última observação: {formatDateTime(input.lastObservedAt)}</span> : null}
          {input.checkpointGeneration !== null ? <span>Checkpoint: {input.checkpointGeneration}</span> : null}
          {input.checkpointUpdatedAt ? <span>Checkpoint atualizado: {formatDateTime(input.checkpointUpdatedAt)}</span> : null}
        </div>
      </header>

      {input.metrics ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricTile
            label="RAW recente"
            current={input.metrics.recentRawTokenCount}
            limit={input.metrics.recentRawTokenLimit}
            detail={`${formatNumber(input.metrics.recentRawMessageCount)} itens ativos`}
          />
          <MetricTile
            label="Overflow RAW"
            current={input.metrics.overflowTokenCount}
            limit={input.metrics.observationTriggerTokenLimit}
            detail={`${formatNumber(input.metrics.overflowMessageCount)} itens fora da reserva`}
          />
          <MetricTile
            label="Observations"
            current={input.metrics.observationTokenCount}
            limit={input.metrics.reflectionTriggerTokenLimit}
            detail={`${formatNumber(input.metrics.activeObservationBlockCount)} blocos ativos`}
          />
          <MetricTile
            label="Reflections"
            current={input.metrics.reflectionTokenCount}
            limit={input.metrics.reflectionBudget}
            detail={`${formatNumber(input.metrics.activeReflectionBlockCount)} blocos ativos`}
          />
          <MetricTile
            label="Checkpoint Summary"
            current={input.metrics.checkpointTokenCount}
            detail={
              input.metrics.checkpointSummaryUpToGeneration !== null
                ? `até geração ${formatNumber(input.metrics.checkpointSummaryUpToGeneration)}`
                : 'sem summary persistido'
            }
          />
          <MetricTile
            label="Thread após cursor"
            current={input.metrics.rawMessageCount}
            unit="itens"
            detail={
              input.metrics.latestThreadMessageAt
                ? `última mensagem ${formatDateTime(input.metrics.latestThreadMessageAt)}`
                : 'sem mensagens após cursor'
            }
          />
        </div>
      ) : null}

      {input.ltm ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricTile
            label="LTM pacotes"
            current={input.ltm.packageCount}
            unit="pacotes"
            detail={input.ltm.running ? 'workflow em execução' : input.ltm.queued ? 'execução enfileirada' : 'workflow ocioso'}
          />
          <MetricTile
            label="LTM escritos"
            current={input.ltm.packageCount}
            unit="pacotes"
            detail={
              input.ltm.lastWrittenAt
                ? `último write ${formatDateTime(input.ltm.lastWrittenAt)}`
                : 'nenhum pacote escrito'
            }
          />
        </div>
      ) : null}

      <MemoryDisclosure
        title="Status de ausência"
        value={input.executionState === 'absent' || input.lastExecutionError
          ? [
              `estado: ${input.executionState}`,
              `motivo: ${input.lastExecutionError ?? '—'}`,
              `em: ${input.lastExecutionErrorAt ? formatDateTime(input.lastExecutionErrorAt) : '—'}`,
            ].join('\n')
          : null}
      />

      <MemoryDisclosure
        title="Working Memory"
        value={input.workingMemory}
      />
      <MemoryDisclosure
        title="AGENT_CONTEXT.md"
        value={input.agentContext}
      />
      <MemoryDisclosure
        title="Checkpoint Summary"
        value={input.checkpointSummary}
      />
      <MemoryDisclosure
        title="Observations"
        value={input.observations}
      />
      <MemoryDisclosure
        title="Reflection"
        value={input.reflection}
      />
      <MemoryDisclosure
        title="LTM status"
        value={input.ltm ? [
          `running: ${input.ltm.running ? 'yes' : 'no'}`,
          `queued: ${input.ltm.queued ? 'yes' : 'no'}`,
          `lastRunAt: ${input.ltm.lastRunAt ? formatDateTime(input.ltm.lastRunAt) : '—'}`,
          `lastRunError: ${input.ltm.lastRunError ?? '—'}`,
          `lastRunErrorAt: ${input.ltm.lastRunErrorAt ? formatDateTime(input.ltm.lastRunErrorAt) : '—'}`,
          `lastWrittenPackageId: ${input.ltm.lastWrittenPackageId ?? '—'}`,
          `lastWrittenAt: ${input.ltm.lastWrittenAt ? formatDateTime(input.ltm.lastWrittenAt) : '—'}`,
          `packageCount: ${formatNumber(input.ltm.packageCount)}`,
        ].join('\n') : null}
      />
    </section>
  );
}

function MetricTile(input: {
  label: string;
  current: number;
  unit?: string;
  limit?: number;
  detail?: string;
}) {
  const percent = input.limit && input.limit > 0
    ? Math.min(999, Math.round((input.current / input.limit) * 100))
    : null;

  return (
    <div className="rounded-2xl border border-border/80 bg-background/70 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {input.label}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">
        {formatNumber(input.current)} {input.unit ?? 'tokens'}
      </div>
      {input.limit ? (
        <div className="mt-1 text-xs text-muted-foreground">
          de {formatNumber(input.limit)} • {percent}%
        </div>
      ) : null}
      {input.detail ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {input.detail}
        </div>
      ) : null}
    </div>
  );
}

function MemoryDisclosure(input: {
  title: string;
  value: string | null;
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>{input.title}</span>
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="pt-3">
        {input.value ? (
          <div className="max-w-full min-w-0 overflow-x-auto whitespace-pre-wrap break-all rounded-2xl border border-border/80 bg-background/70 p-4 text-xs leading-6 text-foreground [overflow-wrap:anywhere]">
            {input.value}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Sem dados.</div>
        )}
      </div>
    </details>
  );
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value);
}

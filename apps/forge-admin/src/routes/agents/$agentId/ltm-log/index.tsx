import { createFileRoute } from '@tanstack/react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

import { PageHeader } from '@/components/admin';
import { getAgentLongTermMemoryThreadMessages, getAgentRuntimeMemory } from '@/lib/admin-api';

import { ThreadMessageArticle } from '../log/-thread-message-content';

export const Route = createFileRoute('/agents/$agentId/ltm-log/')({
  component: AgentLongTermMemoryLogIndexRoute,
});

const PAGE_SIZE = 20;

function AgentLongTermMemoryLogIndexRoute() {
  const { agentId } = Route.useParams();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const runtimeMemoryQuery = useQuery({
    queryKey: ['admin', 'agent', agentId, 'runtime-memory'],
    queryFn: () => getAgentRuntimeMemory(agentId),
  });
  const messagesQuery = useInfiniteQuery({
    queryKey: ['admin', 'agent', agentId, 'ltm-thread-messages'],
    queryFn: ({ pageParam }) => getAgentLongTermMemoryThreadMessages(agentId, pageParam, PAGE_SIZE),
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
      <PageHeader
        title="Log da LTM"
        description="Thread própria do agente de memória longa."
      />

      <LongTermMemorySection
        ltm={runtimeMemoryQuery.data?.ltm ?? null}
        ltmRecall={runtimeMemoryQuery.data?.ltmRecall ?? null}
        loading={runtimeMemoryQuery.isLoading}
        error={runtimeMemoryQuery.error?.message ?? null}
      />

      {messages.length === 0 ? (
        <div className="text-sm text-muted-foreground">Nenhum log da LTM ainda.</div>
      ) : null}

      {messages.map((message, index) => (
        <ThreadMessageArticle key={message.id} message={message} index={index} />
      ))}

      <div ref={sentinelRef} className="h-4" />
      {messagesQuery.isFetchingNextPage ? (
        <div className="text-sm text-muted-foreground">Carregando mais...</div>
      ) : null}
      {messagesQuery.error ? (
        <div className="text-sm text-destructive">{messagesQuery.error.message}</div>
      ) : null}
    </div>
  );
}

function LongTermMemorySection(input: {
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
  ltmRecall: {
    status: 'hit' | 'miss' | 'error';
    query: string;
    resultIds: string[];
    resultCount: number;
    resultScores: number[];
    stepsJson: string;
    updatedAt: number;
    lastInitAt: number | null;
    searchMode: string;
    topK: number;
    indexPaths: string[];
    workspaceFileCount: number;
    memoryFileCount: number;
    checkpointFileCount: number;
    error: string | null;
  } | null;
  loading: boolean;
  error: string | null;
}) {
  if (input.loading) {
    return <div className="text-sm text-muted-foreground">Carregando estado da LTM...</div>;
  }

  if (input.error) {
    return <div className="text-sm text-destructive">{input.error}</div>;
  }

  if (!input.ltm && !input.ltmRecall) {
    return null;
  }

  return (
    <section className="space-y-4 border-b border-border pb-6">
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
      <MemoryDisclosure
        title="LTM Recall"
        value={input.ltmRecall ? [
          `status: ${input.ltmRecall.status}`,
          `updatedAt: ${formatDateTime(input.ltmRecall.updatedAt)}`,
          `lastInitAt: ${input.ltmRecall.lastInitAt ? formatDateTime(input.ltmRecall.lastInitAt) : '—'}`,
          `searchMode: ${input.ltmRecall.searchMode}`,
          `topK: ${formatNumber(input.ltmRecall.topK)}`,
          `indexPaths: ${input.ltmRecall.indexPaths.join(', ') || '—'}`,
          `workspaceFileCount: ${formatNumber(input.ltmRecall.workspaceFileCount)}`,
          `memoryFileCount: ${formatNumber(input.ltmRecall.memoryFileCount)}`,
          `checkpointFileCount: ${formatNumber(input.ltmRecall.checkpointFileCount)}`,
          `resultCount: ${formatNumber(input.ltmRecall.resultCount)}`,
          `resultIds: ${input.ltmRecall.resultIds.join(', ') || '—'}`,
          `resultScores: ${input.ltmRecall.resultScores.map((score) => score.toFixed(4)).join(', ') || '—'}`,
          `error: ${input.ltmRecall.error ?? '—'}`,
          '',
          input.ltmRecall.query,
        ].join('\n') : null}
      />
      <MemoryDisclosure
        title="LTM Recall Steps JSON"
        value={input.ltmRecall?.stepsJson ?? null}
      />
    </section>
  );
}

function MetricTile(input: {
  label: string;
  current: number;
  unit?: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-background/70 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {input.label}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">
        {formatNumber(input.current)} {input.unit ?? 'tokens'}
      </div>
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

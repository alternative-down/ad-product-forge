import { createFileRoute } from '@tanstack/react-router';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';

import { PageHeader } from '@/components/admin';
import {
  getAgentLongTermMemoryThreadMessages,
  getAgentRuntimeMemory,
  runAgentLongTermMemoryRecallSearch,
} from '@/lib/admin-api';
import type { AgentLongTermMemoryRecallDebugSearchResult } from '@/lib/admin-api/agent-types';

import { ThreadMessageArticle } from '../log/-thread-message-content';

export const Route = createFileRoute('/agents/$agentId/ltm-log/')({
  component: AgentLongTermMemoryLogIndexRoute,
});

const PAGE_SIZE = 20;
const LIVE_REFETCH_INTERVAL_MS = 5_000;

function AgentLongTermMemoryLogIndexRoute() {
  const { agentId } = Route.useParams();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const runtimeMemoryQuery = useQuery({
    queryKey: ['admin', 'agent', agentId, 'runtime-memory'],
    queryFn: () => getAgentRuntimeMemory(agentId),
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
  });
  const recallSearchMutation = useMutation({
    mutationFn: () =>
      runAgentLongTermMemoryRecallSearch({
        agentId,
        query: searchQuery,
      }),
  });
  const messagesQuery = useInfiniteQuery({
    queryKey: ['admin', 'agent', agentId, 'ltm-thread-messages'],
    queryFn: ({ pageParam }) => getAgentLongTermMemoryThreadMessages(agentId, pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.hasMore ? lastPageParam + 1 : undefined,
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
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
        recallSearch={recallSearchMutation.data ?? null}
        recallSearchLoading={recallSearchMutation.isPending}
        recallSearchError={recallSearchMutation.error?.message ?? null}
        onRecallSearchSubmit={(event) => {
          event.preventDefault();
          void recallSearchMutation.mutateAsync();
        }}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
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
    graphHit: boolean;
    stepsJson: string;
    updatedAt: number;
    lastInitAt: number | null;
    searchMode: string;
    topK: number;
    graphTopK: number;
    graphThreshold: number;
    graphRandomWalkSteps: number;
    indexPaths: string[];
    workspaceFileCount: number;
    memoryFileCount: number;
    checkpointFileCount: number;
    error: string | null;
  } | null;
  recallSearch: AgentLongTermMemoryRecallDebugSearchResult | null;
  recallSearchLoading: boolean;
  recallSearchError: string | null;
  onRecallSearchSubmit: (event: FormEvent<HTMLFormElement>) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
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
          `graphTopK: ${formatNumber(input.ltmRecall.graphTopK)}`,
          `graphThreshold: ${input.ltmRecall.graphThreshold}`,
          `graphRandomWalkSteps: ${formatNumber(input.ltmRecall.graphRandomWalkSteps)}`,
          `graphHit: ${input.ltmRecall.graphHit ? 'yes' : 'no'}`,
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

      <section className="space-y-3">
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Teste manual de recall
        </div>
        <form className="space-y-3" onSubmit={input.onRecallSearchSubmit}>
          <textarea
            className="min-h-28 w-full rounded-2xl border border-border/80 bg-background/70 px-4 py-3 text-sm text-foreground outline-none transition focus:border-foreground/30"
            value={input.searchQuery}
            onChange={(event) => input.onSearchQueryChange(event.target.value)}
            placeholder="Texto para testar embeddings e retrieval..."
          />
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-xl border border-border/80 bg-background/80 px-4 text-sm font-medium text-foreground transition hover:bg-background"
            disabled={input.recallSearchLoading}
          >
            {input.recallSearchLoading ? 'Buscando...' : 'Testar recall'}
          </button>
        </form>
        {input.recallSearchError ? (
          <div className="text-sm text-destructive">{input.recallSearchError}</div>
        ) : null}
        {input.recallSearch ? (
          <RecallSearchResultSection result={input.recallSearch} />
        ) : null}
      </section>
    </section>
  );
}

function RecallSearchResultSection(input: {
  result: AgentLongTermMemoryRecallDebugSearchResult;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border/80 bg-background/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Index ativo"
          current={input.result.activeIndexStats?.count ?? 0}
          unit="vetores"
          detail={input.result.activeIndexStats
            ? `dim ${formatNumber(input.result.activeIndexStats.dimension)} • ${input.result.activeIndexStats.metric ?? '—'}`
            : 'índice não encontrado'}
        />
        <MetricTile
          label="Workspace hits"
          current={input.result.workspaceResults.length}
          unit="resultados"
          detail={`${input.result.searchMode} • topK ${formatNumber(input.result.topK)}`}
        />
        <MetricTile
          label="Vector hits"
          current={input.result.vectorResults.length}
          unit="resultados"
          detail={`embed dim ${formatNumber(input.result.queryEmbeddingDimension)}`}
        />
        <MetricTile
          label="Graph"
          current={input.result.graphSourcesCount}
          unit="sources"
          detail={`topK ${formatNumber(input.result.graphTopK)} • threshold ${input.result.graphThreshold}`}
        />
      </div>

      <MemoryDisclosure
        title="Query usada"
        value={input.result.query || '—'}
      />
      <MemoryDisclosure
        title="Texto final injetado"
        value={input.result.injectedSystemMessage}
      />
      <MemoryDisclosure
        title="Estado do índice"
        value={[
          `workspace.canBM25: ${input.result.workspaceCanBm25 ? 'yes' : 'no'}`,
          `workspace.canVector: ${input.result.workspaceCanVector ? 'yes' : 'no'}`,
          `workspace.canHybrid: ${input.result.workspaceCanHybrid ? 'yes' : 'no'}`,
          `activeIndexName: ${input.result.activeIndexName}`,
          `availableIndexes: ${input.result.availableIndexes.join(', ') || '—'}`,
          `indexCount: ${input.result.activeIndexStats ? formatNumber(input.result.activeIndexStats.count) : '—'}`,
          `dimension: ${input.result.activeIndexStats ? formatNumber(input.result.activeIndexStats.dimension) : '—'}`,
          `metric: ${input.result.activeIndexStats?.metric ?? '—'}`,
          `lastInitAt: ${input.result.lastInitAt ? formatDateTime(input.result.lastInitAt) : '—'}`,
        ].join('\n')}
      />
      <MemoryDisclosure
        title="Embedding da query"
        value={JSON.stringify(input.result.queryEmbedding)}
      />
      <MemoryDisclosure
        title="Workspace formatado"
        value={input.result.workspaceFormattedContext || null}
      />
      <MemoryDisclosure
        title="Graph query"
        value={input.result.graphQuery || null}
      />
      <MemoryDisclosure
        title="Graph config"
        value={[
          `dimension: ${formatNumber(input.result.graphDimension)}`,
          `includeSources: ${input.result.graphIncludeSources ? 'yes' : 'no'}`,
          `hit: ${input.result.graphHit ? 'yes' : 'no'}`,
          `sourcesCount: ${formatNumber(input.result.graphSourcesCount)}`,
        ].join('\n')}
      />

      {input.result.workspaceResults.length > 0 ? (
        <div className="space-y-3">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Workspace results
          </div>
          {input.result.workspaceResults.map((result) => (
            <div
              key={result.id}
              className="space-y-2 rounded-2xl border border-border/80 bg-background/70 p-4"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{result.id}</span>
                <span>score bruto: {result.score !== null ? result.score.toFixed(4) : '—'}</span>
                <span>percentual relativo: {result.relativePercent !== null ? `${result.relativePercent.toFixed(1)}%` : '—'}</span>
              </div>
              <div className="whitespace-pre-wrap break-all text-xs leading-6 text-foreground [overflow-wrap:anywhere]">
                {result.content || 'Sem conteúdo.'}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Nenhum resultado de workspace.</div>
      )}

      {input.result.vectorResults.length > 0 ? (
        <div className="space-y-3">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Vector index results
          </div>
          {input.result.vectorResults.map((result) => (
            <div
              key={result.id}
              className="space-y-2 rounded-2xl border border-border/80 bg-background/70 p-4"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{result.id}</span>
                <span>score: {result.score.toFixed(4)}</span>
              </div>
              <MemoryDisclosure title="Metadata" value={result.metadataJson} />
              <MemoryDisclosure title="Document" value={result.document} />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Nenhum resultado direto do vector index.</div>
      )}

      <MemoryDisclosure
        title="Graph context"
        value={input.result.graphContext || null}
      />
      <MemoryDisclosure
        title="Graph relevantContext"
        value={input.result.graphRelevantContextRaw}
      />
      <MemoryDisclosure
        title="Graph sources JSON"
        value={input.result.graphSourcesJson}
      />
      <MemoryDisclosure
        title="Graph raw JSON"
        value={input.result.graphRawJson}
      />
      <MemoryDisclosure
        title="Graph error"
        value={input.result.graphError}
      />
    </div>
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

import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { AdminButton, PageHeader } from '@/components/admin';

import { ThreadMessageArticle } from '@/components/agents/log/thread-message-content';
import { useAgentLogData } from './use-agent-log-data';
import { AgentRuntimeMemorySection } from './-agent-runtime-memory-section';

export const Route = createFileRoute('/agents/$agentId/log/')({
  component: AgentLogIndexRoute,
});

function AgentLogIndexRoute() {
  const { agentId } = Route.useParams();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { runtimeMemoryQuery, messagesQuery, clearHistoryMutation } = useAgentLogData({ agentId });
  const { data: runtimeMemory } = runtimeMemoryQuery;
  const { data: messagesData } = messagesQuery;

  const messages = (messagesData?.pages.flatMap((page) => page.items) ?? [])
    .slice()
    .sort((left, right) =>
      left.createdAt === right.createdAt
        ? right.id.localeCompare(left.id)
        : right.createdAt - left.createdAt,
    );

  useEffect(() => {
    const target = sentinelRef.current;

    if (!target) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (
        entries[0]?.isIntersecting &&
        messagesQuery.hasNextPage &&
        !messagesQuery.isFetchingNextPage
      ) {
        void messagesQuery.fetchNextPage();
      }
    });

    observer.observe(target);
    return () => observer.disconnect();
  }, [messagesQuery]);

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader
        title="Log"
        actions={
          <AdminButton
            variant="outline"
            onClick={() => void clearHistoryMutation.mutateAsync()}
            disabled={clearHistoryMutation.isPending}
          >
            {clearHistoryMutation.isPending ? 'Limpando...' : 'Limpar histórico'}
          </AdminButton>
        }
      />

      <AgentRuntimeMemorySection
        workingMemory={runtimeMemory?.workingMemory ?? null}
        agentContext={runtimeMemory?.agentContext ?? null}
        executionState={runtimeMemory?.executionState ?? 'idle'}
        lastExecutionError={runtimeMemory?.lastExecutionError ?? null}
        lastExecutionErrorAt={runtimeMemory?.lastExecutionErrorAt ?? null}
        observations={runtimeMemory?.observations ?? null}
        reflection={runtimeMemory?.reflection ?? null}
        generationCount={runtimeMemory?.generationCount ?? null}
        updatedAt={runtimeMemory?.updatedAt ?? null}
        lastObservedAt={runtimeMemory?.lastObservedAt ?? null}
        checkpointMessageId={runtimeMemory?.checkpointMessageId ?? null}
        checkpointGeneration={runtimeMemory?.checkpointGeneration ?? null}
        checkpointSummary={runtimeMemory?.checkpointSummary ?? null}
        checkpointUpdatedAt={runtimeMemory?.checkpointUpdatedAt ?? null}
        metrics={runtimeMemory?.metrics ?? null}
        loading={runtimeMemoryQuery.isLoading}
        error={runtimeMemoryQuery.error?.message ?? null}
      />

      {messages.length === 0 ? (
        <div className="text-sm text-muted-foreground">Nenhum log ainda.</div>
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
      {clearHistoryMutation.error ? (
        <div className="text-sm text-destructive">{clearHistoryMutation.error.message}</div>
      ) : null}
    </div>
  );
}

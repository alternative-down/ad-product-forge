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
        observations={runtimeMemoryQuery.data?.observations ?? null}
        reflection={runtimeMemoryQuery.data?.reflection ?? null}
        generationCount={runtimeMemoryQuery.data?.generationCount ?? null}
        updatedAt={runtimeMemoryQuery.data?.updatedAt ?? null}
        lastObservedAt={runtimeMemoryQuery.data?.lastObservedAt ?? null}
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
  observations: string | null;
  reflection: string | null;
  generationCount: number | null;
  updatedAt: number | null;
  lastObservedAt: number | null;
  loading: boolean;
  error: string | null;
}) {
  if (input.loading) {
    return <div className="text-sm text-muted-foreground">Carregando memória do agente...</div>;
  }

  if (input.error) {
    return <div className="text-sm text-destructive">{input.error}</div>;
  }

  if (!input.workingMemory && !input.observations && !input.reflection) {
    return null;
  }

  return (
    <section className="space-y-4 border-b border-border pb-6">
      <header className="space-y-1">
        <h2 className="text-sm font-medium text-foreground">Memória</h2>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {input.generationCount !== null ? <span>OM generation: {input.generationCount}</span> : null}
          {input.updatedAt ? <span>Atualizada: {formatDateTime(input.updatedAt)}</span> : null}
          {input.lastObservedAt ? <span>Última observação: {formatDateTime(input.lastObservedAt)}</span> : null}
        </div>
      </header>

      <MemoryDisclosure
        title="Working Memory"
        value={input.workingMemory}
      />
      <MemoryDisclosure
        title="Observations"
        value={input.observations}
      />
      <MemoryDisclosure
        title="Reflection"
        value={input.reflection}
      />
    </section>
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
          <div className="overflow-x-auto whitespace-pre-wrap break-words rounded-2xl border border-border/80 bg-background/70 p-4 text-xs leading-6 text-foreground">
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

import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { PageHeader } from '@/components/admin';

import { ThreadMessageArticle } from '@/components/agents/log/thread-message-content';
import { useLtmLogData } from './use-ltm-log-data';
import { LongTermMemorySection } from '@/components/admin/-ltm-snapshot-section';

export const Route = createFileRoute('/agents/$agentId/ltm-log/')({
  component: AgentLongTermMemoryLogIndexRoute,
});

function AgentLongTermMemoryLogIndexRoute() {
  const { agentId } = Route.useParams();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { runtimeMemoryQuery, recallSearchMutation, messagesQuery } = useLtmLogData({
    agentId,
    searchQuery,
  });
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
      <PageHeader title="Log da LTM" description="Thread própria do agente de memória longa." />

      <LongTermMemorySection
        ltm={runtimeMemory?.ltm ?? null}
        ltmRecall={runtimeMemory?.ltmRecall ?? null}
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

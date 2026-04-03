import { createFileRoute } from '@tanstack/react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { getAgentThreadMessages } from '@/lib/admin-api';

export const Route = createFileRoute('/agents/$agentId/log/')({
  component: AgentLogIndexRoute,
});

const PAGE_SIZE = 20;

function AgentLogIndexRoute() {
  const { agentId } = Route.useParams();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
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
    <div className="min-w-0 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {messages.map((message) => (
        <article key={message.id} className="space-y-2 rounded-sm border border-border bg-background px-4 py-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{humanizeRole(message.role)}</span>
            <span>{formatDateTime(message.createdAt)}</span>
          </div>
          <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {extractThreadMessageText(message.content)}
          </div>
        </article>
      ))}
      {messages.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum log ainda.</div> : null}
      <div ref={sentinelRef} className="h-4" />
      {messagesQuery.isFetchingNextPage ? <div className="text-sm text-muted-foreground">Carregando mais...</div> : null}
      {messagesQuery.error ? <div className="text-sm text-destructive">{messagesQuery.error.message}</div> : null}
    </div>
  );
}

function humanizeRole(role: string) {
  if (role === 'assistant') {
    return 'Assistente';
  }

  if (role === 'user') {
    return 'Usuário';
  }

  if (role === 'system') {
    return 'Sistema';
  }

  return role;
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

function extractThreadMessageText(content: {
  content?: string;
  reasoning?: string;
  parts?: Array<Record<string, unknown>>;
}) {
  if (content.content?.trim()) {
    return content.content;
  }

  if (content.reasoning?.trim()) {
    return content.reasoning;
  }

  const textParts = (content.parts ?? [])
    .map((part) => {
      const type = typeof part.type === 'string' ? part.type : '';

      if (type === 'text' && typeof part.text === 'string') {
        return part.text;
      }

      if (type === 'reasoning' && typeof part.reasoning === 'string' && part.reasoning.trim()) {
        return part.reasoning;
      }

      return null;
    })
    .filter((value): value is string => Boolean(value?.trim()));

  if (textParts.length > 0) {
    return textParts.join('\n\n');
  }

  return 'Sem conteúdo textual.';
}

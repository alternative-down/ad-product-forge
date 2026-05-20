import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';

import { AdminScrollArea } from '@/components/admin';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getAgentConversationMessages, getAgentRecentConversations } from '@/lib/admin-api/index';

export const Route = createFileRoute('/agents/$agentId/conversations/$conversationId/')({
  component: AgentConversationDetailIndexRoute,
});

const PAGE_SIZE = 30;

function AgentConversationDetailIndexRoute() {
  const navigate = useNavigate();
  const { agentId, conversationId } = Route.useParams();
  const decodedConversationId = decodeURIComponent(conversationId);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const initialScrollDoneRef = useRef(false);
  const pendingPrependScrollRef = useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId, 'recent-conversations'],
    queryFn: () => getAgentRecentConversations(agentId),
  });
  const conversations = useMemo(() => agentQuery.data ?? [], [agentQuery.data]);
  const selectedConversation =
    conversations.find((conversation) => conversation.conversationId === decodedConversationId) ??
    null;
  const messagesQuery = useInfiniteQuery({
    queryKey: ['admin', 'agent', agentId, 'conversation', decodedConversationId],
    queryFn: ({ pageParam }) => {
      if (!selectedConversation) {
        throw new Error('Conversa não encontrada.');
      }

      return getAgentConversationMessages(
        agentId,
        selectedConversation.provider,
        selectedConversation.conversationKey,
        PAGE_SIZE,
        pageParam,
      );
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.hasMore ? lastPageParam + PAGE_SIZE : undefined,
    enabled: Boolean(selectedConversation),
  });
  const messages = useMemo(
    () => [...(messagesQuery.data?.pages ?? [])].reverse().flatMap((page) => page.items),
    [messagesQuery.data?.pages],
  );
  const hasNextPage = messagesQuery.hasNextPage;
  const isFetchingNextPage = messagesQuery.isFetchingNextPage;
  const fetchNextPage = messagesQuery.fetchNextPage;

  useEffect(() => {
    initialScrollDoneRef.current = false;
    pendingPrependScrollRef.current = null;
  }, [decodedConversationId]);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-slot=scroll-area-viewport]');

    if (!(viewport instanceof HTMLDivElement)) {
      return;
    }

    if (!initialScrollDoneRef.current && messages.length > 0) {
      viewport.scrollTop = viewport.scrollHeight;
      initialScrollDoneRef.current = true;
      return;
    }

    if (!pendingPrependScrollRef.current) {
      return;
    }

    const previous = pendingPrependScrollRef.current;
    pendingPrependScrollRef.current = null;
    viewport.scrollTop = viewport.scrollHeight - previous.scrollHeight + previous.scrollTop;
  }, [messages]);

  useEffect(() => {
    const target = topSentinelRef.current;
    const viewport = scrollAreaRef.current?.querySelector('[data-slot=scroll-area-viewport]');

    if (!target || !(viewport instanceof HTMLDivElement)) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          pendingPrependScrollRef.current = {
            scrollHeight: viewport.scrollHeight,
            scrollTop: viewport.scrollTop,
          };
          void fetchNextPage();
        }
      },
      {
        root: viewport,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (!selectedConversation) {
    return <div className="text-sm text-muted-foreground">Conversa não encontrada.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              void navigate({ to: '/agents/$agentId/conversations', params: { agentId } })
            }
            className="text-muted-foreground md:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Voltar</span>
          </button>
          <div className="text-base font-semibold tracking-[-0.03em]">
            {selectedConversation.name ?? selectedConversation.provider}
          </div>
        </div>
      </div>

      <div ref={scrollAreaRef} className="h-full min-h-0">
        <AdminScrollArea className="h-full min-h-0" contentClassName="space-y-3">
          <div ref={topSentinelRef} className="h-4" />
          {isFetchingNextPage ? (
            <div className="text-sm text-muted-foreground">Carregando mais...</div>
          ) : null}
          {messages.map((message) => (
            <article key={message.messageId} className="flex items-start gap-3 py-1">
              {message.authorAgentId ? (
                <Link
                  to="/agents/$agentId"
                  params={{ agentId: message.authorAgentId }}
                  className="shrink-0"
                >
                  <Avatar className="h-9 w-9 border border-border bg-muted">
                    <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                      {getInitials(message.authorDisplayName)}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              ) : (
                <Avatar className="h-9 w-9 border border-border bg-muted">
                  <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                    {getInitials(message.authorDisplayName)}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">{message.authorDisplayName}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatRecentMessageTime(Date.parse(message.createdAt))}
                  </span>
                </div>
                <div className="whitespace-pre-wrap break-all text-sm leading-6 text-foreground">
                  {message.content}
                </div>
              </div>
            </article>
          ))}
        </AdminScrollArea>
      </div>
      {messagesQuery.error ? (
        <div className="text-sm text-destructive">{messagesQuery.error.message}</div>
      ) : null}
    </div>
  );
}

function formatRecentMessageTime(value: number) {
  const diffMs = Date.now() - value;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays >= 3) {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
    }).format(value);
  }

  if (diffMs < 60 * 1000) {
    return 'agora';
  }

  if (diffMs < 60 * 60 * 1000) {
    return `${Math.max(1, Math.floor(diffMs / (60 * 1000)))} min`;
  }

  if (diffMs < 24 * 60 * 60 * 1000) {
    return `${Math.floor(diffMs / (60 * 60 * 1000))} h`;
  }

  return `${Math.floor(diffDays)} d`;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '??';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

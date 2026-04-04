import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAgent } from '@/lib/admin-api';

export const Route = createFileRoute('/agents/$agentId/conversations')({
  component: AgentConversationsLayoutRoute,
});

function AgentConversationsLayoutRoute() {
  const navigate = useNavigate();
  const { agentId } = Route.useParams();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const agentQuery = useQuery({
    queryKey: ['admin', 'agent', agentId],
    queryFn: () => getAgent(agentId),
  });
  const conversations = useMemo(() => agentQuery.data?.recentConversations ?? [], [agentQuery.data?.recentConversations]);
  const selectedConversationId = pathname.startsWith(`/agents/${agentId}/conversations/`)
    ? decodeURIComponent(pathname.split('/conversations/')[1] ?? '')
    : null;
  const selectedConversation = conversations.find((conversation) => conversation.conversationId === selectedConversationId) ?? null;

  return (
    <div className="min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {conversations.length > 0 ? (
        <div className="flex h-[calc(100dvh-12rem)] min-h-0 flex-col md:grid md:grid-cols-[260px_minmax(0,1fr)] md:gap-6">
          <div className={selectedConversation ? 'hidden min-h-0 md:block' : 'min-h-0'}>
            <ScrollArea className="-mr-2 h-full [&_[data-slot=scroll-area-scrollbar]]:border-l-0">
              <div className="space-y-2 pr-3">
                {conversations.map((conversation) => {
                  const selected = conversation.conversationId === selectedConversation?.conversationId;
                  const latestMessage = conversation.messages[0] ?? null;
                  const conversationPath = buildConversationPath(agentId, conversation.conversationId);

                  return (
                    <Link
                      key={conversation.conversationId}
                      to={conversationPath}
                      className={
                        selected
                          ? 'block w-full rounded-sm border border-border bg-muted px-4 py-3 text-left'
                          : 'block w-full rounded-sm border border-border bg-background px-4 py-3 text-left'
                      }
                    >
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 text-sm font-medium text-foreground">
                            {conversation.name ?? conversation.provider}
                          </div>
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground md:hidden" />
                        </div>
                        {conversation.type === 'group' ? (
                          <div className="line-clamp-2 text-sm text-muted-foreground">
                            {conversation.participants.join(', ')}
                          </div>
                        ) : null}
                        {latestMessage ? (
                          <>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="truncate">{latestMessage.authorDisplayName}</span>
                              <span className="shrink-0">{formatRecentMessageTime(latestMessage.createdAt)}</span>
                            </div>
                            <div className="truncate text-sm text-foreground">
                              {latestMessage.content}
                            </div>
                          </>
                        ) : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          <div className={selectedConversation ? 'min-h-0 block' : 'hidden min-h-0 md:block'}>
            <div className="md:hidden">
              <Select
                value={selectedConversation ? buildConversationPath(agentId, selectedConversation.conversationId) : ''}
                onValueChange={(value) => void navigate({ to: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{selectedConversation?.name ?? selectedConversation?.provider ?? 'Conversas'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {conversations.map((conversation) => (
                    <SelectItem key={conversation.conversationId} value={buildConversationPath(agentId, conversation.conversationId)}>
                      {conversation.name ?? conversation.provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Outlet />
          </div>
        </div>
      ) : null}

      {conversations.length === 0 ? <div className="text-sm text-muted-foreground">Nenhuma conversa recente.</div> : null}
      {agentQuery.error ? <div className="text-sm text-destructive">{agentQuery.error.message}</div> : null}
    </div>
  );
}

function buildConversationPath(agentId: string, conversationId: string) {
  return `/agents/${agentId}/conversations/${encodeURIComponent(conversationId)}`;
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

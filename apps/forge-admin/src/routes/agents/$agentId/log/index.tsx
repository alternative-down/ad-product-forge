import { createFileRoute } from '@tanstack/react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { PageHeader } from '@/components/admin';
import { Badge } from '@/components/ui/badge';
import { getAgentThreadMessages, type AgentThreadMessage } from '@/lib/admin-api';

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
    <div className="min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="Log" />

      {messages.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum log ainda.</div> : null}

      {messages.map((message, index) => (
        <article key={message.id} className={index > 0 ? 'border-t border-border pt-5' : ''}>
          <div className="space-y-3 pb-5">
            <header className="flex flex-wrap items-center gap-3">
              <Badge variant="outline">{humanizeRole(message.role)}</Badge>
              {message.type ? <Badge variant="outline">{message.type}</Badge> : null}
              <div className="text-xs text-muted-foreground">{formatDateTime(message.createdAt)}</div>
            </header>

            <ThreadMessageContent message={message} />
          </div>
        </article>
      ))}

      <div ref={sentinelRef} className="h-4" />
      {messagesQuery.isFetchingNextPage ? <div className="text-sm text-muted-foreground">Carregando mais...</div> : null}
      {messagesQuery.error ? <div className="text-sm text-destructive">{messagesQuery.error.message}</div> : null}
    </div>
  );
}

function ThreadMessageContent(input: {
  message: AgentThreadMessage;
}) {
  const content = input.message.content;
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const visibleParts = parts.filter(shouldRenderPart);
  const hasVisibleTextPart = visibleParts.some((part) => getPartType(part) === 'text');
  const hasToolInvocationPart = visibleParts.some((part) => getPartType(part) === 'tool-invocation');

  return (
    <div className="space-y-3">
      {!hasVisibleTextPart && typeof content.content === 'string' && content.content.trim() ? (
        <ThreadSection label="Response text · content.content">
          {content.content.trim()}
        </ThreadSection>
      ) : null}

      {visibleParts.map((part, index) => (
        <ThreadPart key={`${input.message.id}:${getPartType(part)}:${index}`} part={part} />
      ))}

      {typeof content.reasoning === 'string' && content.reasoning.trim() ? (
        <ThreadDisclosure
          summary="Reasoning / Thinking"
          label="Reasoning / Thinking · content.reasoning"
          value={content.reasoning.trim()}
        />
      ) : null}

      {Array.isArray(content.toolInvocations) && content.toolInvocations.length > 0 && !hasToolInvocationPart ? (
        <ThreadJsonDisclosure
          summary="content.toolInvocations"
          label="toolInvocations"
          value={content.toolInvocations}
        />
      ) : null}

      {visibleParts.length === 0 &&
      (!content.content || !content.content.trim()) &&
      (!content.reasoning || !content.reasoning.trim()) &&
      (!Array.isArray(content.toolInvocations) || content.toolInvocations.length === 0) ? (
        <div className="text-sm text-muted-foreground">Sem conteúdo textual.</div>
      ) : null}
    </div>
  );
}

function ThreadPart(input: {
  part: Record<string, unknown>;
}) {
  const type = getPartType(input.part);

  if (type === 'text') {
    const text = typeof input.part.text === 'string' ? input.part.text.trim() : '';

    if (!text) {
      return null;
    }

    return (
      <ThreadSection label="Response text · content.parts.text">
        {text}
      </ThreadSection>
    );
  }

  if (type === 'reasoning') {
    const reasoning = getReasoningText(input.part);

    if (!reasoning) {
      return null;
    }

    return (
      <ThreadDisclosure
        summary="Reasoning / Thinking"
        label="Reasoning / Thinking · content.parts.reasoning"
        value={reasoning}
      />
    );
  }

  if (type === 'tool-invocation') {
    const toolInvocation = isRecord(input.part.toolInvocation) ? input.part.toolInvocation : null;
    const toolName = typeof toolInvocation?.toolName === 'string' ? toolInvocation.toolName : 'tool';
    const state = typeof toolInvocation?.state === 'string' ? toolInvocation.state : null;
    const summary = state === 'result' ? `Tool result: ${toolName}` : `Tool call: ${toolName}`;

    return (
      <ThreadJsonDisclosure
        summary={summary}
        label="toolInvocation"
        value={toolInvocation ?? input.part}
      />
    );
  }

  if (type === 'source') {
    const source = isRecord(input.part.source) ? input.part.source : null;
    const title = typeof source?.title === 'string' ? source.title.trim() : '';
    const url = typeof source?.url === 'string' ? source.url : 'source';

    return (
      <ThreadJsonDisclosure
        summary={`source: ${title || url}`}
        label="source"
        value={source ?? input.part}
      />
    );
  }

  if (type === 'file') {
    const mimeType = typeof input.part.mimeType === 'string' ? input.part.mimeType : 'file';

    return (
      <ThreadJsonDisclosure
        summary={`file: ${mimeType}`}
        label="file"
        value={input.part}
      />
    );
  }

  return (
    <ThreadJsonDisclosure
      summary={type}
      label="part"
      value={input.part}
    />
  );
}

function ThreadSection(input: {
  label: string;
  children: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{input.label}</div>
      <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">{input.children}</div>
    </div>
  );
}

function ThreadDisclosure(input: {
  summary: string;
  label: string;
  value: string;
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>{input.summary}</span>
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-1 pt-3">
        <div className="text-xs font-medium text-muted-foreground">{input.label}</div>
        <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">{input.value}</div>
      </div>
    </details>
  );
}

function ThreadJsonDisclosure(input: {
  summary: string;
  label: string;
  value: unknown;
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>{input.summary}</span>
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-1 pt-3">
        <div className="text-xs font-medium text-muted-foreground">{input.label}</div>
        <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-foreground">
          {JSON.stringify(input.value, null, 2)}
        </pre>
      </div>
    </details>
  );
}

function shouldRenderPart(part: Record<string, unknown>) {
  const type = getPartType(part);

  if (!type || type === 'step-start' || type.startsWith('data-')) {
    return false;
  }

  if (type === 'text') {
    return typeof part.text === 'string' && part.text.trim().length > 0;
  }

  if (type === 'reasoning') {
    return Boolean(getReasoningText(part));
  }

  return true;
}

function getPartType(part: Record<string, unknown>) {
  return typeof part.type === 'string' ? part.type : '';
}

function getReasoningText(part: Record<string, unknown>) {
  if (typeof part.reasoning === 'string' && part.reasoning.trim()) {
    return part.reasoning.trim();
  }

  if (!Array.isArray(part.details)) {
    return '';
  }

  return part.details
    .filter(isRecord)
    .filter((detail) => detail.type === 'text' && typeof detail.text === 'string' && detail.text.trim())
    .map((detail) => detail.text as string)
    .join('\n')
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

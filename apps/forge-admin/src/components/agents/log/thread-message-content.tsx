import { ChevronDown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { type AgentThreadMessage } from '@/lib/admin-api/index';

export function ThreadMessageArticle(input: { message: AgentThreadMessage; index: number }) {
  return (
    <article
      className={`min-w-0 overflow-hidden ${input.index > 0 ? 'border-t border-border pt-5' : ''}`}
    >
      <div className="min-w-0 space-y-3 pb-5">
        <header className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">
            {input.message.type
              ? humanizeOperationalMemoryType(input.message.type)
              : humanizeRole(input.message.role)}
          </Badge>
          <div className="text-xs text-muted-foreground">
            {formatDateTime(input.message.createdAt)}
          </div>
        </header>

        <ThreadMessageContent message={input.message} />
      </div>
    </article>
  );
}

function ThreadMessageContent(input: { message: AgentThreadMessage }) {
  const { content } = input.message;
  const textParts = (content.parts ?? []).flatMap((part) =>
    part.type === 'text' && typeof part.text === 'string' ? [part.text] : [],
  );
  const reasoningParts = (content.parts ?? []).flatMap((part) =>
    part.type === 'reasoning' && typeof part.text === 'string' ? [part.text] : [],
  );
  const texts = textParts.length > 0 ? textParts : content.content ? [content.content] : [];
  const reasoning = reasoningParts.length > 0 ? reasoningParts.join('\n\n') : content.reasoning;

  if (texts.length === 0 && !reasoning && (content.toolInvocations?.length ?? 0) === 0) {
    return <p className="text-sm text-muted-foreground">Sem conteúdo textual.</p>;
  }

  return (
    <div className="min-w-0 space-y-3 overflow-hidden">
      {texts.map((text, index) => (
        <p
          className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground"
          key={`${input.message.id}:text:${index}`}
        >
          {text}
        </p>
      ))}

      {reasoning ? <ThreadDisclosure summary="Reasoning / Thinking" value={reasoning} /> : null}

      {content.toolInvocations?.map((invocation, index) => (
        <ThreadDisclosure
          key={`${input.message.id}:tool:${index}`}
          summary={getToolSummary(invocation)}
          value={JSON.stringify(invocation, null, 2)}
        />
      ))}
    </div>
  );
}

function ThreadDisclosure(input: { summary: string; value: string }) {
  return (
    <details className="group rounded-md border border-border/70 bg-muted/25 px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground">
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
        {input.summary}
      </summary>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
        {input.value}
      </pre>
    </details>
  );
}

function getToolSummary(invocation: Record<string, unknown>) {
  const toolName = typeof invocation.toolName === 'string' ? invocation.toolName : 'tool';
  const state = typeof invocation.state === 'string' ? invocation.state : null;
  return state === 'result' ? `Tool result: ${toolName}` : `Tool call: ${toolName}`;
}

function humanizeOperationalMemoryType(type: string) {
  if (type === 'observation') {
    return 'Observação da memória';
  }

  if (type === 'reflection') {
    return 'Reflexão da memória';
  }

  if (type === 'checkpoint-summary') {
    return 'Checkpoint da memória';
  }

  return type;
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

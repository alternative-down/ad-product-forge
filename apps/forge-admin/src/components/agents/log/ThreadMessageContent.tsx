import { ChevronDown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { type AgentThreadMessage } from '@/lib/admin-api';

export function ThreadMessageArticle(input: {
  message: AgentThreadMessage;
  index: number;
}) {
  return (
    <article className={`min-w-0 overflow-hidden ${input.index > 0 ? 'border-t border-border pt-5' : ''}`}>
      <div className="min-w-0 space-y-3 pb-5">
        <header className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">{humanizeRole(input.message.role)}</Badge>
          {input.message.type ? <Badge variant="outline">{input.message.type}</Badge> : null}
          <div className="text-xs text-muted-foreground">{formatDateTime(input.message.createdAt)}</div>
        </header>

        <ThreadMessageContent message={input.message} />
      </div>
    </article>
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
    <div className="min-w-0 space-y-3 overflow-hidden">
      {!hasVisibleTextPart && typeof content.content === 'string' && content.content.trim() ? (
        <ThreadTextSegments
          label="content.content"
          value={content.content.trim()}
        />
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
      <ThreadTextSegments
        label="content.parts.text"
        value={text}
      />
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
    <div className="min-w-0 space-y-1 overflow-hidden">
      <div className="text-xs font-medium text-muted-foreground">{input.label}</div>
      <div className="min-w-0 overflow-hidden whitespace-pre-wrap break-all text-sm leading-6 text-foreground [overflow-wrap:anywhere]">
        {input.children}
      </div>
    </div>
  );
}

function isMemoryRecallText(value: string) {
  return /^\s*<memory-recall\b[\s\S]*<\/memory-recall>\s*$/u.test(value);
}

function splitMemoryRecallSegments(value: string) {
  const segments: Array<{
    kind: 'text' | 'memory-recall';
    value: string;
  }> = [];
  const pattern = /<memory-recall\b[\s\S]*?<\/memory-recall>/gu;
  let lastIndex = 0;

  for (const match of value.matchAll(pattern)) {
    const matchStart = match.index ?? 0;
    const matchText = match[0];
    const before = value.slice(lastIndex, matchStart).trim();

    if (before) {
      segments.push({
        kind: 'text',
        value: before,
      });
    }

    segments.push({
      kind: 'memory-recall',
      value: matchText.trim(),
    });
    lastIndex = matchStart + matchText.length;
  }

  const after = value.slice(lastIndex).trim();

  if (after) {
    segments.push({
      kind: 'text',
      value: after,
    });
  }

  return segments;
}

function decodeXmlEntities(value: string) {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', '\'')
    .replaceAll('&amp;', '&');
}

function parseXmlAttributes(value: string) {
  const attributes: Record<string, string> = {};

  for (const match of value.matchAll(/([\w-]+)="([^"]*)"/gu)) {
    const [, key, rawValue] = match;
    attributes[key] = decodeXmlEntities(rawValue);
  }

  return attributes;
}

function parseMemoryRecallXml(value: string) {
  const rootMatch = value.match(/<memory-recall\b([^>]*)>([\s\S]*?)<\/memory-recall>/u);

  if (!rootMatch) {
    return null;
  }

  const [, , body] = rootMatch;
  const instructionsMatch = body.match(/<instructions>([\s\S]*?)<\/instructions>/u);
  const items = Array.from(body.matchAll(/<item\b([^>]*)>([\s\S]*?)<\/item>/gu)).map((match) => ({
    attributes: parseXmlAttributes(match[1] ?? ''),
    content: decodeXmlEntities((match[2] ?? '').trim()),
  }));

  return {
    instructions: instructionsMatch ? decodeXmlEntities(instructionsMatch[1].trim()) : null,
    items,
  };
}

function ThreadTextSegments(input: {
  label: string;
  value: string;
}) {
  const segments = splitMemoryRecallSegments(input.value);

  if (segments.length === 0) {
    return isMemoryRecallText(input.value)
      ? (
        <ThreadDisclosure
          summary="Memory Recall"
          label={`Memory Recall · ${input.label}`}
          value={input.value}
        />
      )
      : (
        <ThreadSection label={`Response text · ${input.label}`}>
          {input.value}
        </ThreadSection>
      );
  }

  return (
    <div className="min-w-0 space-y-3 overflow-hidden">
      {segments.map((segment, index) => (
        segment.kind === 'memory-recall'
          ? (
            <ThreadMemoryRecallDisclosure
              key={`${input.label}:memory-recall:${index}`}
              xml={segment.value}
              label={`Memory Recall · ${input.label}`}
            />
          )
          : (
            <ThreadSection
              key={`${input.label}:text:${index}`}
              label={`Response text · ${input.label}`}
            >
              {segment.value}
            </ThreadSection>
          )
      ))}
    </div>
  );
}

function ThreadMemoryRecallDisclosure(input: {
  label: string;
  xml: string;
}) {
  const parsed = parseMemoryRecallXml(input.xml);

  if (!parsed) {
    return (
      <ThreadDisclosure
        summary="Memory Recall"
        label={input.label}
        value={input.xml}
      />
    );
  }

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>Memory Recall</span>
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="min-w-0 space-y-3 overflow-hidden pt-3">
        {parsed.instructions
          ? (
            <ThreadDisclosure
              summary="Instructions"
              label={null}
              value={parsed.instructions}
            />
          )
          : null}

        {parsed.items.map((item, index) => (
          <ThreadDisclosure
            key={`${input.label}:item:${index}`}
            summary={formatMemoryRecallItemSummary(index, item.attributes.score)}
            label={null}
            value={item.content}
          />
        ))}
      </div>
    </details>
  );
}

function formatMemoryRecallItemSummary(index: number, score: string | undefined) {
  const scoreValue = typeof score === 'string' ? Number(score) : Number.NaN;

  if (!Number.isFinite(scoreValue)) {
    return `Item ${index + 1}`;
  }

  return `Item ${index + 1} - score ${scoreValue.toFixed(2)}`;
}

function ThreadDisclosure(input: {
  summary: string;
  label: string | null;
  value: string;
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>{input.summary}</span>
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="min-w-0 space-y-1 overflow-hidden pt-3">
        {input.label ? <div className="text-xs font-medium text-muted-foreground">{input.label}</div> : null}
        <div className="min-w-0 overflow-hidden whitespace-pre-wrap break-all text-sm leading-6 text-foreground [overflow-wrap:anywhere]">
          {input.value}
        </div>
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
      <div className="min-w-0 space-y-1 overflow-hidden pt-3">
        <div className="text-xs font-medium text-muted-foreground">{input.label}</div>
        <pre className="max-w-full min-w-0 overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-foreground [overflow-wrap:anywhere]">
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
  if (typeof part.text === 'string' && part.text.trim()) {
    return part.text.trim();
  }

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

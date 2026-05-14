import { forgeDebug } from '@forge-runtime/core';
import { decryptSecret } from '../../encryption/crypto';


type RuntimeStoredMessagePart = {
  type: 'text' | 'tool-call' | 'tool-result';
  text?: { content: string };
  toolCall?: { toolName: string; toolCallId: string; input: unknown };
  toolResult?: { toolCallId: string; result: unknown };
};

import { agentSchedules, type AgentSchedule } from '../../database/schema';

// Tool name patterns for badge extraction
const TOOL_NAME_BADGES: Array<{ pattern: RegExp; icon: string; label: string }> = [
  { pattern: /workspace_execute_command|shell|bash|run_command/i, icon: '💻', label: 'Terminal' },
  { pattern: /workspace_read_file|read_file|file_read/i, icon: '📄', label: 'File' },
  { pattern: /workspace_write_file|write_file|file_write/i, icon: '✏️', label: 'Write' },
  { pattern: /workspace_edit_file|edit_file|file_edit/i, icon: '🔧', label: 'Edit' },
  { pattern: /list_files|workspace_list_files|file_list/i, icon: '📁', label: 'Files' },
  { pattern: /grep|search|find/i, icon: '🔎', label: 'Search' },
  { pattern: /http|fetch|request|curl/i, icon: '🌐', label: 'HTTP' },
  { pattern: /email|mail|send/i, icon: '📧', label: 'Email' },
  { pattern: /memory|recall|remember/i, icon: '🧠', label: 'Memory' },
  { pattern: /git|github|commit|push/i, icon: '🐙', label: 'GitHub' },
  { pattern: /schedule|cron|job/i, icon: '⏰', label: 'Schedule' },
  { pattern: /discord|slack|chat/i, icon: '💬', label: 'Chat' },
  { pattern: /mcp|tool/i, icon: '🔌', label: 'MCP' },
];

// Direct tool name to icon mappings
const TOOL_ICONS: Record<string, string> = {
  workspace_execute_command: '💻',
  workspace_read_file: '📄',
  workspace_write_file: '✏️',
  workspace_edit_file: '🔧',
  workspace_list_files: '📁',
  workspace_grep: '🔎',
  send_http_request: '🌐',
  send_email: '📧',
  memory_recall: '🧠',
  search: '🔎',
};

/**
 * Check if a string contains a memory-recall XML-like tag
 */
export function isMemoryRecallText(value: string) {
  return /^\s*<memory-recall\b[\s\S]*<\/memory-recall>\s*$/u.test(value);
}

/**
 * Split text into segments of regular text and memory-recall blocks
 */
export function splitMemoryRecallSegments(value: string) {
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
      value: matchText,
    });
    lastIndex = matchStart + matchText.length;
  }

  const remaining = value.slice(lastIndex).trim();

  if (remaining) {
    segments.push({
      kind: 'text',
      value: remaining,
    });
  }

  return segments;
}

/**
 * Truncate a string to a maximum length, adding ellipsis if needed
 */
export function truncatePreview(value: string) {
  const maxLength = 200;
  const ellipsis = '…';

  if (value.length < maxLength) {
    return value;
  }

  return value.slice(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Get tool badge (icon and label) for a given tool name
 */
export function toToolBadge(toolName: string) {
  const normalizedToolName = toolName.toLowerCase();

  for (const { pattern, icon, label } of TOOL_NAME_BADGES) {
    if (pattern.test(normalizedToolName)) {
      return { icon, label };
    }
  }

  const directIcon = TOOL_ICONS[normalizedToolName];

  if (directIcon) {
    return { icon: directIcon, label: toolName };
  }

  return { icon: '⚙️', label: toolName };
}

/**
 * Humanize a memory key by replacing underscores and capitalizing
 */
export function humanizeMemoryKey(value: string) {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/(^|\s)[a-z]/g, (str: string) => str.toUpperCase())
    .trim();
}

/**
 * Format a working memory value (JSON string) to markdown bullet points
 */
export function formatWorkingMemoryValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const entries = Object.entries(parsed)
      .filter(([, item]) => item !== null && item !== undefined)
      .map(([fieldKey, item]) => `- **${humanizeMemoryKey(fieldKey)}**: ${String(item).trim()}`);

    if (entries.length === 0) {
      return null;
    }

    return entries.join('\n');
  } catch { // @ts-expect-error non-fatal — caller handles null
    // Safe: malformed JSON from external source — return null to signal no valid content
    return null;
  }
}

/**
 * Render working memory value as markdown sections
 */
export function renderWorkingMemoryMarkdown(value: unknown) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const sections = new Map<string, string[]>();

  for (const [key, item] of Object.entries(record)) {
    const sectionKey = key.replace(/^working_memory_/, '');
    const formattedValue = formatWorkingMemoryValue(String(item));

    if (formattedValue) {
      const existing = sections.get(sectionKey) ?? [];
      existing.push(formattedValue);
      sections.set(sectionKey, existing);
    }
  }

  if (sections.size === 0) {
    return null;
  }

  return Array.from(sections.entries())
    .map(([sectionKey, entries]) => {
      return [`## ${humanizeMemoryKey(sectionKey)}`, ...entries].join('\n');
    })
    .join('\n\n');
}

/**
 * Convert agent schedule row to summary object
 */
export function toScheduleSummary(row: AgentSchedule) {
  return {
    scheduleId: row.id,
    kind: row.kind,
    name: row.name,
    description: row.description ?? undefined,
    scheduleType: (row.scheduleType ?? 'cron') as 'cron' | 'date',
    cronExpression: row.cronExpression ?? undefined,
    scheduledDate: row.scheduledDate ?? undefined,
    timezone: row.timezone ?? 'UTC',
    content: row.content ?? '',
    wakeWhenRunning: Boolean(row.wakeWhenRunning),
    isActive: row.isActive != null ? Boolean(row.isActive) : true,
    lastTriggeredAt: row.lastTriggeredAt ?? undefined,
    nextTriggerAt: row.nextTriggerAt ?? undefined,
    createdAt: row.createdAt ?? undefined,
    updatedAt: row.updatedAt ?? undefined,
  };
}

/**
 * Extract preview text from message content (text, reasoning, or parts)
 */
export function extractLatestMessagePreview(content: unknown) {
  if (!content || typeof content !== 'object') {
    return null;
  }

  const record = content as {
    content?: unknown;
    reasoning?: unknown;
    parts?: unknown;
  };
  const parts = Array.isArray(record.parts) ? record.parts : [];

  for (const part of [...parts].reverse()) {
    if (!part || typeof part !== 'object') {
      continue;
    }

    if (
      'type' in part &&
      (part.type === 'text' || part.type === 'reasoning') &&
      'text' in part &&
      typeof part.text === 'string'
    ) {
      const text = splitMemoryRecallSegments(part.text)
        .filter((segment) => segment.kind === 'text')
        .map((segment) => segment.value)
        .join('\n')
        .trim();

      if (text && !isMemoryRecallText(text)) {
        return truncatePreview(text);
      }
    }
  }

  if (typeof record.content === 'string' && record.content.trim()) {
    const text = splitMemoryRecallSegments(record.content)
      .filter((segment) => segment.kind === 'text')
      .map((segment) => segment.value)
      .join('\n')
      .trim();

    if (text && !isMemoryRecallText(text)) {
      return truncatePreview(text);
    }
  }

  if (typeof record.reasoning === 'string' && record.reasoning.trim()) {
    return truncatePreview(record.reasoning.trim());
  }

  return null;
}

/**
 * Extract tool badge from message content (memory-recall or tool invocations)
 */
export function extractLatestMessageToolBadge(content: unknown) {
  if (!content || typeof content !== 'object') {
    return null;
  }

  const record = content as {
    parts?: unknown;
    toolInvocations?: unknown;
    content?: unknown;
  };
  const parts = Array.isArray(record.parts) ? record.parts : [];
  const topLevelToolInvocations = Array.isArray(record.toolInvocations) ? record.toolInvocations : [];

  for (const part of [...parts].reverse()) {
    if (!part || typeof part !== 'object' || !('type' in part) || part.type !== 'text' || typeof part.text !== 'string') {
      continue;
    }

    if (splitMemoryRecallSegments(part.text).some((segment) => segment.kind === 'memory-recall')) {
      return { icon: '🧠', label: 'Recall' };
    }
  }

  if (
    typeof record.content === 'string'
    && splitMemoryRecallSegments(record.content).some((segment) => segment.kind === 'memory-recall')
  ) {
    return { icon: '🧠', label: 'Recall' };
  }

  for (const part of [...parts].reverse()) {
    if (!part || typeof part !== 'object' || !('type' in part) || part.type !== 'tool-invocation') {
      continue;
    }

    if (!('toolInvocation' in part) || !part.toolInvocation || typeof part.toolInvocation !== 'object') {
      continue;
    }

    const toolName = 'toolName' in part.toolInvocation && typeof part.toolInvocation.toolName === 'string'
      ? part.toolInvocation.toolName
      : null;

    if (toolName) {
      return toToolBadge(toolName);
    }
  }

  for (const invocation of [...topLevelToolInvocations].reverse()) {
    if (!invocation || typeof invocation !== 'object' || !('toolName' in invocation) || typeof invocation.toolName !== 'string') {
      continue;
    }

    return toToolBadge(invocation.toolName);
  }

  return null;
}

// ============================================================================
// Message Processing Helpers
// ============================================================================

export function decryptProviderConfig(encryptedCredentials: string) {
  const decrypted = decryptSecret(encryptedCredentials);

  try {
    return JSON.parse(decrypted) as unknown;
  } catch (err) {
    forgeDebug({ scope: 'admin-read-model', level: 'error', message: 'Failed to parse credentials JSON: ' + String(error), context: { error: error instanceof Error ? error.message : String(error) } });
    throw new Error('Failed to parse credentials JSON: ' + (error instanceof Error ? error.message : String(error)));
  }
}

export function mergeToolLogMessages(messages: Array<{
  id: string;
  role: string;
  threadId: string;
  createdAt: string;
  parts: RuntimeStoredMessagePart[];
  metadata?: Record<string, unknown>;
}>) {
  const merged: typeof messages = [];

  for (const message of messages) {
    const previousMessage = merged[merged.length - 1];

    if (
      previousMessage?.role === 'assistant'
      && message.role === 'tool'
      && Array.isArray(previousMessage.metadata?.toolInvocations)
      && previousMessage.metadata.toolInvocations.length > 0
      && Array.isArray(message.metadata?.toolResults)
      && message.metadata.toolResults.length > 0
    ) {
      merged[merged.length - 1] = {
        ...previousMessage,
        metadata: {
          ...previousMessage.metadata,
          toolResults: message.metadata.toolResults,
        },
      };
      continue;
    }

    merged.push(message);
  }

  return merged;
}

function indexToolResultsByToolCallId(toolResults: unknown[]) {
  const resultIndexesByToolCallId = new Map<string, number>();
  for (const [index, toolResult] of toolResults.entries()) {
    if (
      typeof toolResult === 'object'
      && toolResult !== null
      && typeof (toolResult as Record<string, unknown>).toolCallId === 'string'
    ) {
      resultIndexesByToolCallId.set((toolResult as { toolCallId: string }).toolCallId, index);
    }
  }
  return resultIndexesByToolCallId;
}

function processToolInvocations(
  toolInvocations: unknown[],
  resultIndexesByToolCallId: Map<string, number>,
  toolResults: unknown[],
) {
  const parts: Array<Record<string, unknown>> = [];
  const matchedResultIndexes = new Set<number>();

  for (const toolInvocation of toolInvocations) {
    if (
      typeof toolInvocation !== 'object'
      || toolInvocation === null
      || typeof (toolInvocation as Record<string, unknown>).toolName !== 'string'
    ) {
      continue;
    }

    const toolCallId = typeof (toolInvocation as Record<string, unknown>).toolCallId === 'string'
      ? (toolInvocation as Record<string, unknown>).toolCallId as string
      : null;
    const matchingResultIndex = toolCallId
      ? resultIndexesByToolCallId.get(toolCallId)
      : undefined;
    const matchingResult = matchingResultIndex !== undefined
      ? toolResults[matchingResultIndex] as Record<string, unknown> | null
      : null;

    if (matchingResultIndex !== undefined) {
      matchedResultIndexes.add(matchingResultIndex);
    }

    parts.push({
      type: 'tool-invocation',
      toolInvocation: {
        ...toolInvocation,
        ...(typeof matchingResult === 'object' && matchingResult !== null
          ? {
              result: matchingResult.result,
              state: 'result',
            }
          : {
              state: 'call',
            }),
      },
    });
  }

  return { parts, matchedResultIndexes };
}

function collectUnmatchedResults(
  toolResults: unknown[],
  matchedResultIndexes: Set<number>,
) {
  const parts: Array<Record<string, unknown>> = [];

  for (const [index, toolResult] of toolResults.entries()) {
    if (
      matchedResultIndexes.has(index)
      || typeof toolResult !== 'object'
      || toolResult === null
    ) {
      continue;
    }

    parts.push({
      type: 'tool-result',
      toolResult: {
        toolCallId: (toolResult as Record<string, unknown>).toolCallId,
        result: (toolResult as Record<string, unknown>).result,
      },
    });
  }

  return parts;
}

export function buildThreadToolInvocationParts(metadata: Record<string, unknown> | undefined) {
  const toolInvocations = Array.isArray(metadata?.toolInvocations)
    ? metadata.toolInvocations
    : [];
  const toolResults = Array.isArray(metadata?.toolResults)
    ? metadata.toolResults
    : [];

  const resultIndexesByToolCallId = indexToolResultsByToolCallId(toolResults);
  const { parts: invocationParts, matchedResultIndexes } = processToolInvocations(
    toolInvocations,
    resultIndexesByToolCallId,
    toolResults,
  );
  const unmatchedResultParts = collectUnmatchedResults(toolResults, matchedResultIndexes);

  return [...invocationParts, ...unmatchedResultParts];
}


/**
 * Extracts participant names from conversation data.
 * Used for displaying conversation participants in the admin UI.
 */
export function collectConversationParticipants(input: {
  name?: string;
  participants?: string[];
  messages: Array<{
    authorDisplayName?: string;
  }>;
}) {
  const participants = new Set<string>();

  for (const participant of input.participants ?? []) {
    if (participant && participant !== input.name) {
      participants.add(participant);
    }
  }

  for (const message of input.messages) {
    if (message.authorDisplayName && message.authorDisplayName !== input.name) {
      participants.add(message.authorDisplayName);
    }
  }

  return [...participants];
}

/**
 * Type guard: true if the part is a text or reasoning part with a non-empty text field.
 */
type MessagePart = { type?: string; text?: string };
type TextPart = Extract<MessagePart, { type: 'text' | 'reasoning' }>;

export function isTextPart(part: MessagePart): part is TextPart {
  return (part.type === 'text' || part.type === 'reasoning') && Boolean(part.text);
}




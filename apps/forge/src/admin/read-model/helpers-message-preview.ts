/**
 * Message preview + tool badge extraction for admin/read-model.
 *
 * Extracted from helpers.ts (D49 #6491). Handles extracting human-readable
 * previews and tool invocation badges from message content for the admin
 * UI. Pure functions with no side effects.
 */
import {
  isMemoryRecallText,
  isNonNullObject,
  partsOfContent,
} from './helpers-type-guards';
import { splitMemoryRecallSegments } from './helpers-memory-formatting';

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

export { TOOL_NAME_BADGES, TOOL_ICONS };

export function truncatePreview(value: string) {
  const maxLength = 200;
  const ellipsis = '…';

  if (value.length < maxLength) {
    return value;
  }

  return value.slice(0, maxLength - ellipsis.length) + ellipsis;
}

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
 * Extract preview text from message content (text, reasoning, or parts)
 */
export function extractLatestMessagePreview(content: unknown) {
  if (!isNonNullObject(content)) return null;
  const record = content;
  const parts = partsOfContent(record);

  for (const part of [...parts].reverse()) {
    if (!isNonNullObject(part)) {
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
  if (!isNonNullObject(content)) return null;
  const record = content;
  const parts = partsOfContent(record);
  const topLevelToolInvocations = Array.isArray(record.toolInvocations)
    ? record.toolInvocations
    : [];

  for (const part of [...parts].reverse()) {
    if (
      !isNonNullObject(part) ||
      !('type' in part) ||
      part.type !== 'text' ||
      typeof part.text !== 'string'
    ) {
      continue;
    }

    if (splitMemoryRecallSegments(part.text).some((segment) => segment.kind === 'memory-recall')) {
      return { icon: '🧠', label: 'Recall' };
    }
  }

  if (
    typeof record.content === 'string' &&
    splitMemoryRecallSegments(record.content).some((segment) => segment.kind === 'memory-recall')
  ) {
    return { icon: '🧠', label: 'Recall' };
  }

  for (const part of [...parts].reverse()) {
    if (
      !isNonNullObject(part) ||
      !('type' in part) ||
      part.type !== 'tool-invocation'
    ) {
      continue;
    }

    if (
      !('toolInvocation' in part) ||
      !isNonNullObject(part.toolInvocation)
    ) {
      continue;
    }

    const toolName =
      'toolName' in part.toolInvocation && typeof part.toolInvocation.toolName === 'string'
        ? part.toolInvocation.toolName
        : null;
    if (toolName === null || toolName === '') continue;

    return toToolBadge(toolName);
  }

  for (const invocation of [...topLevelToolInvocations].reverse()) {
    if (
      !isNonNullObject(invocation) ||
      !('toolName' in invocation) ||
      typeof invocation.toolName !== 'string'
    ) {
      continue;
    }

    return toToolBadge(invocation.toolName);
  }

  return null;
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
    if ((message.authorDisplayName ?? '') !== '' && message.authorDisplayName !== input.name) {
      participants.add(message.authorDisplayName ?? '');
    }
  }

  return [...participants];
}

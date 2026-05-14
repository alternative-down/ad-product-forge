export type ToolBadge = {
  icon: string;
  label: string;
} | null;

/**
 * Truncates a string preview to at most 220 characters.
 * Appends "..." if truncated. Handles multi-byte chars gracefully.
 */
export function truncatePreview(value: string): string {
  return value.length > 220 ? `${value.slice(0, 217).trimEnd()}...` : value;
}

/**
 * Extracts the preview text from a message content object.
 * Handles both 'text' and 'reasoning' part types, joining multiple segments.
 * Returns null if no text parts are found.
 */
export function extractLatestMessagePreview(content: unknown): string | null {
  if (!content || typeof content !== 'object') {
    return null;
  }

  const parts = Array.isArray((content as { parts?: unknown[] }).parts)
    ? (content as { parts: Array<Record<string, unknown>> }).parts
    : [];

  const textSegments = parts
    .filter((part) => part.type === 'text' || part.type === 'reasoning')
    .map((part) => String(part.text ?? '').trim())
    .filter(Boolean);

  if (textSegments.length === 0) {
    return null;
  }

  return truncatePreview(textSegments.join(' '));
}

/**
 * Extracts the tool badge (icon + label) from a message content object.
 * Returns a badge object for recognized tool categories, or null otherwise.
 *
 * Categories: send_message, workspace_*, github_*, search_*
 */
export function extractLatestMessageToolBadge(content: unknown): ToolBadge {
  if (!content || typeof content !== 'object') {
    return null;
  }

  const parts = Array.isArray((content as { parts?: unknown[] }).parts)
    ? (content as { parts: Array<Record<string, unknown>> }).parts
    : [];

  const toolCallPart = parts.find((part) => part.type === 'tool-call');

  if (!toolCallPart || typeof toolCallPart.toolName !== 'string') {
    return null;
  }

  const toolName: string = toolCallPart.toolName;

  if (toolName === 'send_message') {
    return { icon: '✉️', label: 'Mensagem' };
  }

  if (toolName.startsWith('workspace_')) {
    return { icon: '🛠️', label: 'Workspace' };
  }

  if (toolName.startsWith('github_')) {
    return { icon: '🐙', label: 'GitHub' };
  }

  if (toolName.startsWith('search_')) {
    return { icon: '🔎', label: 'Busca' };
  }

  return null;
}
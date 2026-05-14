// Pure functions for extracting text preview and tool badge from message content.

import type { RuntimeStoredMessagePart } from './agent-home-metrics-tool-helpers';

/**
 * Truncates a string to at most 220 characters.
 * If longer, returns the first 217 chars + "..." (total 220).
 */
export function truncatePreview(value: string): string {
  return value.length > 220 ? `${value.slice(0, 217).trimEnd()}...` : value;
}

type ContentWithParts = {
  parts: Array<{ type: string; text?: string; toolName?: string; [key: string]: unknown }>;
};

/**
 * Extracts a text preview from message content by joining all text/reasoning parts.
 *
 * Algorithm:
 * - Extracts parts array from content (empty if not present or not an array).
 * - Collects all text segments from parts where type is 'text' or 'reasoning'.
 * - Joins with spaces, trims, filters empty strings.
 * - Returns null if no text segments found.
 * - Truncates result to 220 chars via truncatePreview.
 *
 * Pure function — no I/O, no side effects.
 */
export function extractLatestMessagePreview(content: unknown): string | null {
  if (!content || typeof content !== 'object') {
    return null;
  }

  const c = content as ContentWithParts;
  const parts = Array.isArray(c.parts) ? c.parts : [];
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
 * Extracts a tool badge (icon + label) from the first tool-call part in content.
 *
 * Mapping:
 * - send_message → ✉️ / Mensagem
 * - workspace_* → 🛠️ / Workspace
 * - github_* → 🐙 / GitHub
 * - search_* → 🔎 / Busca
 * - other → null
 *
 * Returns null if no tool-call part found or toolName is not a string.
 *
 * Pure function — no I/O, no side effects.
 */
export function extractLatestMessageToolBadge(
  content: unknown,
): { icon: string; label: string } | null {
  if (!content || typeof content !== 'object') {
    return null;
  }

  const c = content as ContentWithParts;
  const parts = Array.isArray(c.parts) ? c.parts : [];
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
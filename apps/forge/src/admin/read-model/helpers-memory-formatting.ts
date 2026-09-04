/**
 * Working memory formatting helpers for admin/read-model.
 *
 * Extracted from helpers.ts (D49 #6491). Handles parsing, segmentation,
 * humanization, and markdown rendering of working-memory values for the
 * admin UI. Pure functions, no side effects.
 */
import { errorMsg } from '../../agents/error-formatting';
import { isNonNullObject } from './helpers-type-guards';
import { adminDebug } from './helpers-debug';

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
export function formatWorkingMemoryValue(value: string | null | undefined): string | null {
  if ((value ?? '') === '') return null;
  try {
    const parsed: unknown = JSON.parse(value ?? '');
    if (!isNonNullObject(parsed)) return null;
    const entries = Object.entries(parsed)
      .map(([fieldKey, item]) => formatWorkingMemoryEntry(fieldKey, item, 0))
      .filter((entry): entry is string => entry !== null);
    return entries.length > 0 ? entries.join('\n') : null;
  } catch (err) {
    adminDebug('debug', 'entriesToMarkdown failed: ' + errorMsg(err));
    // Safe: malformed JSON from external source — return null to signal no valid content
    return null;
  }
}

function formatWorkingMemoryEntry(
  fieldKey: string,
  value: unknown,
  indentation: number,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const prefix = ' '.repeat(indentation);
  const label = humanizeMemoryKey(fieldKey);

  if (isNonNullObject(value)) {
    const children = Object.entries(value)
      .map(([childKey, childValue]) =>
        formatWorkingMemoryEntry(childKey, childValue, indentation + 2),
      )
      .filter((entry): entry is string => entry !== null);

    return children.length > 0 ? [`${prefix}- **${label}**:`, ...children].join('\n') : null;
  }

  const text = Array.isArray(value) ? value.join(', ').trim() : String(value).trim();
  return text !== '' ? `${prefix}- **${label}**: ${text}` : null;
}

/**
 * Render working memory value as markdown sections
 */
export function renderWorkingMemoryMarkdown(value: unknown): string | null {
  if (!isNonNullObject(value)) return null;

  const record = value;
  const sections = new Map<string, string[]>();

  for (const [key, item] of Object.entries(record)) {
    const sectionKey = key.replace(/^working_memory_/, '');
    const formattedValue = formatWorkingMemoryValue(String(item));

    if ((formattedValue ?? '') !== '') {
      const existing = sections.get(sectionKey) ?? [];
      existing.push(formattedValue ?? '');
      sections.set(sectionKey, existing);
    }
  }

  if (sections.size === 0) return null;

  return Array.from(sections.entries())
    .map(([sectionKey, entries]) => {
      return [`## ${humanizeMemoryKey(sectionKey)}`, ...entries].join('\n');
    })
    .join('\n\n');
}

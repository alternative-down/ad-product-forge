/**
 * Type guards used across admin/read-model thematic helpers.
 *
 * Extracted from helpers.ts (D49 #6491). All type guards centralize the
 * defensive "is this X?" checks that previously appeared at 20+ sites in
 * the file. Replaces `as Record<string, unknown>` and `as unknown as`
 * casts with proper type narrowing (L#NN-50 #33 STRENGTHENING).
 */

export function isNonNullObject(v: unknown): v is Record<string, unknown> {
  return v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v);
}

export function hasToolCallId(value: unknown): value is { toolCallId: string } {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).toolCallId === 'string';
}

export function hasToolName(value: unknown): value is { toolName: string } {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).toolName === 'string';
}

/**
 * Check if a string contains a memory-recall XML-like tag
 */
export function isMemoryRecallText(value: string) {
  return /^\s*<memory-recall\b[\s\S]*<\/memory-recall>\s*$/u.test(value);
}

export type MessagePart = { type?: string; text?: string };
export type TextPart = Extract<MessagePart, { type: 'text' | 'reasoning' }>;

/**
 * Type guard: true if the part is a text or reasoning part with a non-empty text field.
 */
export function isTextPart(part: MessagePart): part is TextPart {
  return (part.type === 'text' || part.type === 'reasoning') && Boolean(part.text);
}

/**
 * Extract the parts array from a message content object. Returns
 * an empty array for any non-record input.
 */
export function partsOfContent(content: unknown): unknown[] {
  if (!isNonNullObject(content)) return [];
  return Array.isArray(content.parts) ? content.parts : [];
}

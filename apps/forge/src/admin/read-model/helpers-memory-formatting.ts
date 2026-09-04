/**
 * Long-term-memory recall formatting helpers for admin/read-model.
 */

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

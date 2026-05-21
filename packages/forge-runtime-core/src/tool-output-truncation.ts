const MAX_TOOL_OUTPUT_CHARS = 8_000;
const MAX_TOOL_OUTPUT_LINES = 120;
const MAX_TOOL_OUTPUT_ARRAY_ITEMS = 25;
const MAX_TOOL_OUTPUT_OBJECT_KEYS = 50;

export function truncateToolOutputValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return truncateToolOutputText(value);
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_TOOL_OUTPUT_ARRAY_ITEMS)
      .map((item) => truncateToolOutputValue(item));

    if (value.length <= MAX_TOOL_OUTPUT_ARRAY_ITEMS) {
      return items;
    }

    return [
      ...items,
      {
        truncated: true,
        reason: 'array-items',
        keptItems: MAX_TOOL_OUTPUT_ARRAY_ITEMS,
        omittedItems: value.length - MAX_TOOL_OUTPUT_ARRAY_ITEMS,
      },
    ];
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    const nextEntries = entries
      .slice(0, MAX_TOOL_OUTPUT_OBJECT_KEYS)
      .map(([key, item]) => [key, truncateToolOutputValue(item)] as const);
    const nextValue = Object.fromEntries(nextEntries);

    if (entries.length <= MAX_TOOL_OUTPUT_OBJECT_KEYS) {
      return nextValue;
    }

    return {
      ...nextValue,
      truncated: true,
      truncatedReason: 'object-keys',
      keptKeys: MAX_TOOL_OUTPUT_OBJECT_KEYS,
      omittedKeys: entries.length - MAX_TOOL_OUTPUT_OBJECT_KEYS,
    };
  }

  return value;
}

function truncateToolOutputText(text: string) {
  const allLines = text.split('\n');
  const limitedLinesArray = allLines.slice(0, MAX_TOOL_OUTPUT_LINES);
  const limitedLines = limitedLinesArray.join('\n');
  const limitedChars =
    limitedLines.length > MAX_TOOL_OUTPUT_CHARS
      ? limitedLines.slice(0, MAX_TOOL_OUTPUT_CHARS)
      : limitedLines;

  if (limitedChars === text) {
    return text;
  }

  const removedChars = Math.max(text.length - limitedChars.length, 0);
  const removedLines = Math.max(allLines.length - limitedLinesArray.length, 0);

  return [
    limitedChars,
    '',
    `[truncated tool output: omitted ${removedChars} chars and ${removedLines} lines from the returned result. The full output was still produced outside the model context. Re-read the source with a narrower range using offset/limit or line ranges.]`,
  ].join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

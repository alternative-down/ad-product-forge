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
  const limitedLines = text.split('\n').slice(0, MAX_TOOL_OUTPUT_LINES).join('\n');
  const limitedChars = limitedLines.length > MAX_TOOL_OUTPUT_CHARS
    ? limitedLines.slice(0, MAX_TOOL_OUTPUT_CHARS)
    : limitedLines;

  if (limitedChars === text) {
    return text;
  }

  return `${limitedChars}\n\n[truncated tool output]`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

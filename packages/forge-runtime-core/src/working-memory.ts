export function appendWorkingMemoryInstructions(baseInstructions: string, additions: string[]) {
  const trimmedAdditions = additions.map((value) => value.trim()).filter(Boolean);

  if (trimmedAdditions.length === 0) {
    return baseInstructions;
  }

  return `${baseInstructions.trim()}\n\n${trimmedAdditions.join('\n\n')}`.trim();
}

export async function sanitizeWorkingMemory(input: {
  text?: string | null;
  maxChars?: number;
}) {
  const text = input.text?.trim() ?? '';

  if (!input.maxChars || text.length <= input.maxChars) {
    return text;
  }

  return text.slice(-input.maxChars);
}

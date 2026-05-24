/** Returns true if the given text starts with the NO_ACTION_NEEDED marker. */
export function extractControlDirective(text: string): 'stop' | 'no-action-needed' | null {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('STOP_AND_IDLE')) return 'stop';
  if (trimmed.startsWith('NO_ACTION_NEEDED')) return 'no-action-needed';
  return null;
}

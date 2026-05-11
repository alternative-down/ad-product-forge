/** Returns true if the given text starts with the NO_ACTION_NEEDED marker. */
export function isNoActionNeeded(text: string): boolean {
  return text.trimStart().startsWith('NO_ACTION_NEEDED');
}

/** Returns true if the given text starts with the STOP_AND_IDLE marker. */
export function isStopAndIdle(text: string): boolean {
  return text.trimStart().startsWith('STOP_AND_IDLE');
}

/** Returns the control directive (stop | no-action-needed | null) for the given step text. */
export function extractControlDirective(text: string): 'stop' | 'no-action-needed' | null {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('STOP_AND_IDLE')) return 'stop';
  if (trimmed.startsWith('NO_ACTION_NEEDED')) return 'no-action-needed';
  return null;
}

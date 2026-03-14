export const WORKING_MEMORY_INSTRUCTIONS = [
  'Working memory is your constitution.',
  'Use it only for stable, long-lived facts about yourself.',
  'Store only your identity, role, mission, principles, permanent constraints, and stable preferences explicitly defined for you.',
  'Do not store conversation history, recent requests, event summaries, users, channels, links, in-progress tasks, current context, logs, counts, or transient facts.',
  'If the information is about a user, an external event, a current task, or something likely to change soon, do not put it in working memory.',
  'Keep it short, dense, and stable.',
  'Use short bullets.',
].join('\n');

export const WORKING_MEMORY_TEMPLATE = [
  'Identity',
  '-',
  'Role',
  '-',
  'Mission',
  '-',
  'Principles',
  '-',
  'Permanent constraints',
  '-',
  'Stable preferences',
  '-',
].join('\n');

export function appendWorkingMemoryInstructions<T>(instructions: T): T {
  if (typeof instructions !== 'string') {
    return instructions;
  }

  return `${instructions}\n\n${WORKING_MEMORY_INSTRUCTIONS}` as T;
}

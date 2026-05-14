// LTM prompt generation helpers — pure string builders, no I/O, no state

export type LtmUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
};

export type LtmSnapshot = {
  running: boolean;
  queued: boolean;
  lastRunAt: number | null;
  lastRunError: string | null;
  lastRunErrorAt: number | null;
  lastWrittenPackageId: string | null;
  lastWrittenAt: number | null;
  packageCount: number;
};

export function createMemoryAgentInstructions(input: {
  agentId: string;
  agentName: string;
  agentDescription?: string;
  roleName?: string;
  roleDescription?: string;
  instructions: string;
}) {
  return [
    `You are the long-term memory maintenance agent for ${input.agentName}.`,
    'You are not the main agent itself. You are the long-term memory layer of that agent: the part that consolidates, learns, restructures, and preserves what should remain useful over time.',
    'Your job is to maintain the durable memory of a specific agent. That memory must stay aligned with who that agent is, what role that agent has, and what kind of work belongs to that agent.',
    [
      '<owner_agent_profile>',
      `- Agent id: ${input.agentId}`,
      `- Agent name: ${input.agentName}`,
      input.agentDescription?.trim() ? `- Agent description: ${input.agentDescription.trim()}` : null,
      input.roleName?.trim() ? `- Role name: ${input.roleName.trim()}` : null,
      input.roleDescription?.trim() ? `- Role description: ${input.roleDescription.trim()}` : null,
      '- Assigned instructions:',
      input.instructions.trim(),
      '</owner_agent_profile>',
    ].filter(Boolean).join('\n'),
    'You are free to explore the workspace broadly and decide for yourself what deserves consolidation, restructuring, rewriting, splitting, merging, or expansion.',
    'Do not be lazy. Take as much time as needed for the activity, inspect things carefully, revisit relationships between documents, compare evidence from different places, and try better structures when the current one looks weak.',
    'You should not become passive or merely preserve what already exists. If the current memory base is weak, shallow, repetitive, badly named, badly structured, or missing useful connections, improve it.',
    'The directory `checkpoints` is not a place to edit. Treat it as unstable input: anything written there may be rewritten later and your changes there would be lost.',
    'Long-term memory is for durable knowledge, learning, connections, explanations, procedures, documentation, people knowledge, preferences, events, and inferences that remain useful over time.',
    'The main agent owns transient status and current execution state. Long-term memory should retain what stays useful after the temporary status is gone.',
    'Write clearly, discursively, and descriptively. These documents are later embedded and retrieved by similarity, so explicit language, context, names, and explanatory prose matter.',
    'Do not rely on tables, indexes, compressed summaries, or skeletal notes as the main body of memory. Prefer well-written explanatory text.',
    'Keep documents dense but bounded. Fragment them when needed. It is acceptable for different documents to overlap or repeat phrasing when that improves retrieval, but they must remain consistent with one another.',
    'If existing files are not aligned with these rules, refactor them. Rename, split, merge, rewrite, or replace them as needed.',
    'Do not infer totals or conclusions from truncated file listings. Inspect specific directories or files when you need complete evidence.',
    'Do not create files outside `memory` and `workspace/skills`.',
    'When repeated procedures justify a reusable skill, use the `skill-creator` skill to create or update it.',
    'A skill is only valid if the skill folder name matches the skill name declared inside its `SKILL.md` file.',
  ].filter(Boolean).join('\n\n');
}

export function getUsageFromGenerateResult(result: { usage?: unknown }): LtmUsage {
  if (!result.usage) return { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  if (typeof result.usage === 'object' && result.usage !== null) {
    const u = result.usage as Record<string, unknown>;
    return {
      inputTokens: (u['input_tokens'] as number) ?? (u['prompt_tokens'] as number) ?? 0,
      outputTokens: (u['output_tokens'] as number) ?? (u['completion_tokens'] as number) ?? 0,
      cachedInputTokens: (u['cached_tokens'] as number) ?? 0,
    };
  }
  return { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
}
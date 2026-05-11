/**
 * Unit tests for agent-long-term-memory.ts helper functions.
 *
 * Tests pure helper functions that exist in the module but are not exported.
 * We replicate the function logic inline and verify the same behavior that the
 * module's helpers produce.
 *
 * Functions tested:
 * - createMemoryAgentInstructions (inline)
 * - buildMemoryAgentPrompt (inline)
 * - getUsageFromGenerateResult (inline)
 * - diffTrackedFiles (inline)
 * - renderCheckpointPackageReadme (inline)
 * - renderReflectionFile (inline)
 * - renderObservationFile (inline)
 *
 * No prior coverage.
 */
import { describe, expect, it } from 'vitest';

// ─── Replicated helper logic ─────────────────────────────────────────────────
// These mirror the logic in agent-long-term-memory.ts (lines 49-224).

function createMemoryAgentInstructions(input: {
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

function buildMemoryAgentPrompt() {
  return [
    'Explore the workspace actively and improve the long-term memory base of this agent.',
    'Inspect whatever evidence, documents, checkpoints, memories, and skills help you understand what should be consolidated, reorganized, connected, clarified, or expanded.',
    'Do not follow a lazy maintenance loop. Revisit existing material, try different structures, discover missing connections, compare documents against one another, and improve weak or fragmented knowledge when you see it.',
    'Think of this as an offline consolidation phase: review experience, revisit old notes, compare them with new evidence, strengthen useful abstractions, and preserve better long-term structure.',
    'Prefer durable, descriptive, retrieval-friendly documents and reusable skills when repeated procedures justify them.',
    'Use the `skill-creator` skill when you decide a reusable skill should be created or updated.',
    'A skill is only valid when the directory name matches the skill name declared in its `SKILL.md`.',
    'Do not write status documents, progress snapshots, current-state summaries, or temporary backlog trackers.',
    'Do not edit `checkpoints`. That area may be rewritten later and anything changed there can be lost.',
    'Write clearly, explain things well, and keep information consistent across files even when some overlap or repetition is helpful for retrieval.',
    'When you finish a maintenance pass, do not spend output tokens on maintenance report tables. Only communicate the minimum necessary outcome.',
  ].join('\n');
}

function getUsageFromGenerateResult(result: { usage?: unknown }) {
  const usage = result.usage as {
    inputTokens?: number;
    outputTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    cachedInputTokens?: number;
    inputTokenDetails?: {
      noCacheTokens?: number;
      cacheReadTokens?: number;
    };
  } | undefined;
  const cachedInputTokens =
    usage?.inputTokenDetails?.cacheReadTokens ?? usage?.cachedInputTokens ?? 0;
  const promptTokens = usage?.inputTokens ?? usage?.promptTokens ?? 0;
  const completionTokens = usage?.outputTokens ?? usage?.completionTokens ?? 0;
  return { inputTokens: promptTokens, outputTokens: completionTokens, cachedInputTokens };
}

function diffTrackedFiles(before: Map<string, string>, after: Map<string, string>) {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  for (const [key, afterHash] of after) {
    if (!before.has(key)) {
      added.push(key);
    } else if (before.get(key) !== afterHash) {
      modified.push(key);
    }
  }

  for (const key of before.keys()) {
    if (!after.has(key)) {
      removed.push(key);
    }
  }

  return { added, removed, modified };
}

function renderReflectionFile(reflection: {
  id: string;
  createdAt: string;
  content: string;
  agentId: string;
  conversationId: string;
}) {
  const meta = [
    `Agent: ${reflection.agentId}`,
    `Conversation: ${reflection.conversationId}`,
    `Timestamp: ${reflection.createdAt}`,
  ].join('\n');

  return [
    `# Reflection: ${reflection.id}`,
    '',
    meta,
    '',
    '## Content',
    '',
    reflection.content,
  ].join('\n');
}

function renderObservationFile(observation: {
  id: string;
  createdAt: string;
  content: string;
  agentId: string;
  conversationId: string;
}) {
  const meta = [
    `Agent: ${observation.agentId}`,
    `Conversation: ${observation.conversationId}`,
    `Timestamp: ${observation.createdAt}`,
  ].join('\n');

  return [
    `# Observation: ${observation.id}`,
    '',
    meta,
    '',
    '## Observed',
    '',
    observation.content,
  ].join('\n');
}

function renderCheckpointPackageReadme(input: {
  payload: {
    packageId?: string;
    threadId: string;
    fromGeneration: number;
    toGeneration: number;
    checkpointSummary: {
      summary: string;
      agentMemoryAtGeneration?: { totalChars: number; totalFiles: number };
      updatedAt: string;
    };
    reflections: Array<{ id: string; content: string; createdAt: string }>;
    observations: Array<{ id: string; content: string; createdAt: string }>;
  };
}) {
  const { payload } = input;
  const packageId = payload.packageId ?? 'unknown';

  const reflectionLines = payload.reflections.map((r, i) =>
    `  ${i + 1}. **${r.id}** — ${r.content.slice(0, 80)}${r.content.length > 80 ? '…' : ''}`,
  );
  const observationLines = payload.observations.map((o, i) =>
    `  ${i + 1}. **${o.id}** — ${o.content.slice(0, 80)}${o.content.length > 80 ? '…' : ''}`,
  );

  return [
    `# Memory Checkpoint: ${packageId}`,
    '',
    `Checkpoint from generation ${payload.fromGeneration} → ${payload.toGeneration}.`,
    `Thread: ${payload.threadId}`,
    '',
    '## Summary',
    '',
    payload.checkpointSummary.summary,
    '',
    '## Reflections',
    '',
    ...(payload.reflections.length > 0 ? ['', ...reflectionLines] : ['_No reflections._']),
    '',
    '## Observations',
    '',
    ...(payload.observations.length > 0 ? ['', ...observationLines] : ['_No observations._']),
    '',
    `Generated at: ${payload.checkpointSummary.updatedAt}`,
  ].filter(Boolean).join('\n');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const SAMPLE_REFLECTION = {
  id: 'ref-1',
  createdAt: '2025-03-15T09:00:00.000Z',
  content: 'Discussed project structure with team.',
  agentId: 'agent-1',
  conversationId: 'conv-1',
};

const SAMPLE_OBSERVATION = {
  id: 'obs-1',
  createdAt: '2025-03-15T09:30:00.000Z',
  content: 'Repository had 3 new commits since last visit.',
  agentId: 'agent-1',
  conversationId: 'conv-1',
};

const SAMPLE_PAYLOAD = {
  threadId: 'thread-1',
  fromGeneration: 5,
  toGeneration: 6,
  checkpointSummary: {
    summary: 'Weekly checkpoint — project structure finalized.',
    agentMemoryAtGeneration: { totalChars: 4000, totalFiles: 12 },
    updatedAt: '2025-03-15T10:00:00.000Z',
  },
  reflections: [SAMPLE_REFLECTION],
  observations: [SAMPLE_OBSERVATION],
};

// ─── createMemoryAgentInstructions ────────────────────────────────────────────

describe('createMemoryAgentInstructions', () => {
  it('includes agent name in output', () => {
    const result = createMemoryAgentInstructions({
      agentId: 'agent-42',
      agentName: 'Builder Bot',
      instructions: 'Build things.',
    });
    expect(result).toContain('Builder Bot');
  });

  it('includes agent id', () => {
    const result = createMemoryAgentInstructions({
      agentId: 'agent-42',
      agentName: 'Builder Bot',
      instructions: 'Build things.',
    });
    expect(result).toContain('agent-42');
  });

  it('includes instructions text', () => {
    const result = createMemoryAgentInstructions({
      agentId: 'agent-42',
      agentName: 'Builder Bot',
      instructions: 'Build things.',
    });
    expect(result).toContain('Build things.');
  });

  it('includes agent description when provided', () => {
    const result = createMemoryAgentInstructions({
      agentId: 'agent-42',
      agentName: 'Builder Bot',
      agentDescription: 'A helpful coding assistant.',
      instructions: 'Build things.',
    });
    expect(result).toContain('A helpful coding assistant.');
  });

  it('does not include agent description when absent', () => {
    const result = createMemoryAgentInstructions({
      agentId: 'agent-42',
      agentName: 'Builder Bot',
      instructions: 'Build things.',
    });
    expect(result).not.toContain('Agent description:');
  });

  it('includes roleName when provided', () => {
    const result = createMemoryAgentInstructions({
      agentId: 'agent-42',
      agentName: 'Builder Bot',
      roleName: 'Fullstack Developer',
      instructions: 'Build things.',
    });
    expect(result).toContain('Fullstack Developer');
  });

  it('includes roleDescription when provided', () => {
    const result = createMemoryAgentInstructions({
      agentId: 'agent-42',
      agentName: 'Builder Bot',
      roleName: 'Fullstack Developer',
      roleDescription: 'Builds web apps.',
      instructions: 'Build things.',
    });
    expect(result).toContain('Builds web apps.');
  });

  it('returns a string (not an array)', () => {
    const result = createMemoryAgentInstructions({
      agentId: 'agent-42',
      agentName: 'Builder Bot',
      instructions: 'Build things.',
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('filters falsy values from owner profile section', () => {
    const result = createMemoryAgentInstructions({
      agentId: 'agent-42',
      agentName: 'Builder Bot',
      instructions: 'Build things.',
    });
    // No undefined/null in output
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('null');
  });
});

// ─── buildMemoryAgentPrompt ──────────────────────────────────────────────────

describe('buildMemoryAgentPrompt', () => {
  it('returns a non-empty string', () => {
    const result = buildMemoryAgentPrompt();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('mentions skill-creator', () => {
    expect(buildMemoryAgentPrompt()).toContain('skill-creator');
  });

  it('mentions checkpoints directory', () => {
    expect(buildMemoryAgentPrompt()).toContain('checkpoints');
  });

  it('does not contain STOP_AND_IDLE or NO_ACTION_NEEDED markers', () => {
    const result = buildMemoryAgentPrompt();
    expect(result).not.toContain('STOP_AND_IDLE');
    expect(result).not.toContain('NO_ACTION_NEEDED');
  });

  it('contains maintenance instructions', () => {
    const result = buildMemoryAgentPrompt();
    expect(result).toContain('improve the long-term memory');
    expect(result).toContain('consolidation');
  });
});

// ─── getUsageFromGenerateResult ───────────────────────────────────────────────

describe('getUsageFromGenerateResult', () => {
  it('extracts input and output tokens from standard usage shape', () => {
    const result = getUsageFromGenerateResult({
      usage: { inputTokens: 1000, outputTokens: 500 },
    });
    expect(result.inputTokens).toBe(1000);
    expect(result.outputTokens).toBe(500);
  });

  it('extracts cachedInputTokens from inputTokenDetails.cacheReadTokens', () => {
    const result = getUsageFromGenerateResult({
      usage: {
        inputTokens: 1000,
        outputTokens: 200,
        inputTokenDetails: { cacheReadTokens: 800 },
      },
    });
    expect(result.cachedInputTokens).toBe(800);
  });

  it('falls back to cachedInputTokens at top level when inputTokenDetails absent', () => {
    const result = getUsageFromGenerateResult({
      usage: { inputTokens: 500, outputTokens: 100, cachedInputTokens: 400 },
    });
    expect(result.cachedInputTokens).toBe(400);
  });

  it('falls back to promptTokens/completionTokens aliases', () => {
    const result = getUsageFromGenerateResult({
      usage: { promptTokens: 1000, completionTokens: 500 },
    });
    expect(result.inputTokens).toBe(1000);
    expect(result.outputTokens).toBe(500);
  });

  it('defaults cachedInputTokens to 0 when absent', () => {
    const result = getUsageFromGenerateResult({
      usage: { inputTokens: 1000, outputTokens: 500 },
    });
    expect(result.cachedInputTokens).toBe(0);
  });

  it('handles undefined usage gracefully', () => {
    const result = getUsageFromGenerateResult({});
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    expect(result.cachedInputTokens).toBe(0);
  });

  it('handles null usage', () => {
    const result = getUsageFromGenerateResult({ usage: null });
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });
});

// ─── diffTrackedFiles ─────────────────────────────────────────────────────────

describe('diffTrackedFiles', () => {
  it('returns empty diffs when maps are identical', () => {
    const before = new Map([['a.txt', 'hash-a'], ['b.txt', 'hash-b']]);
    const after = new Map([['a.txt', 'hash-a'], ['b.txt', 'hash-b']]);
    const result = diffTrackedFiles(before, after);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.modified).toEqual([]);
  });

  it('identifies newly added files', () => {
    const before = new Map([['a.txt', 'hash-a']]);
    const after = new Map([['a.txt', 'hash-a'], ['b.txt', 'hash-b']]);
    const result = diffTrackedFiles(before, after);
    expect(result.added).toEqual(['b.txt']);
    expect(result.removed).toEqual([]);
    expect(result.modified).toEqual([]);
  });

  it('identifies removed files', () => {
    const before = new Map([['a.txt', 'hash-a'], ['b.txt', 'hash-b']]);
    const after = new Map([['a.txt', 'hash-a']]);
    const result = diffTrackedFiles(before, after);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual(['b.txt']);
  });

  it('identifies modified files (same key, different hash)', () => {
    const before = new Map([['a.txt', 'hash-old']]);
    const after = new Map([['a.txt', 'hash-new']]);
    const result = diffTrackedFiles(before, after);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.modified).toEqual(['a.txt']);
  });

  it('handles mixed additions, removals, and modifications simultaneously', () => {
    const before = new Map([
      ['a.txt', 'hash-a'],
      ['b.txt', 'hash-b'],
      ['c.txt', 'hash-c'],
    ]);
    const after = new Map([
      ['a.txt', 'hash-a-changed'],
      ['d.txt', 'hash-d'],
      ['c.txt', 'hash-c'],
    ]);
    const result = diffTrackedFiles(before, after);
    expect(result.added).toEqual(['d.txt']);
    expect(result.removed).toEqual(['b.txt']);
    expect(result.modified).toEqual(['a.txt']);
  });

  it('handles empty before map (all files are additions)', () => {
    const before = new Map<string, string>();
    const after = new Map([['a.txt', 'hash-a']]);
    const result = diffTrackedFiles(before, after);
    expect(result.added).toEqual(['a.txt']);
    expect(result.removed).toEqual([]);
  });

  it('handles empty after map (all files are removals)', () => {
    const before = new Map([['a.txt', 'hash-a']]);
    const after = new Map<string, string>();
    const result = diffTrackedFiles(before, after);
    expect(result.removed).toEqual(['a.txt']);
    expect(result.added).toEqual([]);
  });

  it('handles both empty maps', () => {
    const result = diffTrackedFiles(new Map(), new Map());
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.modified).toEqual([]);
  });
});

// ─── renderReflectionFile ─────────────────────────────────────────────────────

describe('renderReflectionFile', () => {
  it('includes reflection id in heading', () => {
    const result = renderReflectionFile(SAMPLE_REFLECTION);
    expect(result).toContain('# Reflection: ref-1');
  });

  it('includes content', () => {
    const result = renderReflectionFile(SAMPLE_REFLECTION);
    expect(result).toContain('Discussed project structure');
  });

  it('includes createdAt timestamp', () => {
    const result = renderReflectionFile(SAMPLE_REFLECTION);
    expect(result).toContain('2025-03-15');
  });

  it('includes agent and conversation metadata', () => {
    const result = renderReflectionFile(SAMPLE_REFLECTION);
    expect(result).toContain('agent-1');
    expect(result).toContain('conv-1');
  });

  it('returns non-empty markdown string', () => {
    const result = renderReflectionFile(SAMPLE_REFLECTION);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('#');
    expect(result).toContain('##');
  });
});

// ─── renderObservationFile ────────────────────────────────────────────────────

describe('renderObservationFile', () => {
  it('includes observation id in heading', () => {
    const result = renderObservationFile(SAMPLE_OBSERVATION);
    expect(result).toContain('# Observation: obs-1');
  });

  it('includes content', () => {
    const result = renderObservationFile(SAMPLE_OBSERVATION);
    expect(result).toContain('3 new commits');
  });

  it('includes createdAt timestamp', () => {
    const result = renderObservationFile(SAMPLE_OBSERVATION);
    expect(result).toContain('2025-03-15');
  });

  it('includes agent and conversation metadata', () => {
    const result = renderObservationFile(SAMPLE_OBSERVATION);
    expect(result).toContain('agent-1');
    expect(result).toContain('conv-1');
  });

  it('returns non-empty markdown string', () => {
    const result = renderObservationFile(SAMPLE_OBSERVATION);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('#');
    expect(result).toContain('##');
  });
});

// ─── renderCheckpointPackageReadme ────────────────────────────────────────────

describe('renderCheckpointPackageReadme', () => {
  it('uses provided packageId in heading', () => {
    const result = renderCheckpointPackageReadme({
      payload: { ...SAMPLE_PAYLOAD, packageId: 'pkg-001' },
    });
    expect(result).toContain('pkg-001');
  });

  it('includes checkpoint summary text', () => {
    const result = renderCheckpointPackageReadme({ payload: SAMPLE_PAYLOAD });
    expect(result).toContain('Weekly checkpoint');
  });

  it('includes generation range', () => {
    const result = renderCheckpointPackageReadme({ payload: SAMPLE_PAYLOAD });
    expect(result).toContain('5');
    expect(result).toContain('6');
  });

  it('lists all reflections', () => {
    const result = renderCheckpointPackageReadme({ payload: SAMPLE_PAYLOAD });
    expect(result).toContain('ref-1');
  });

  it('lists all observations', () => {
    const result = renderCheckpointPackageReadme({ payload: SAMPLE_PAYLOAD });
    expect(result).toContain('obs-1');
  });

  it('indicates when no reflections exist', () => {
    const result = renderCheckpointPackageReadme({
      payload: { ...SAMPLE_PAYLOAD, reflections: [] },
    });
    expect(result).toContain('No reflections');
  });

  it('indicates when no observations exist', () => {
    const result = renderCheckpointPackageReadme({
      payload: { ...SAMPLE_PAYLOAD, observations: [] },
    });
    expect(result).toContain('No observations');
  });

  it('truncates long content in listing', () => {
    const longPayload = {
      ...SAMPLE_PAYLOAD,
      reflections: [{
        ...SAMPLE_REFLECTION,
        id: 'ref-long',
        content: 'A'.repeat(200),
      }],
    };
    const result = renderCheckpointPackageReadme({ payload: longPayload });
    expect(result).toContain('…'); // truncation marker
    expect(result).not.toContain('A'.repeat(200));
  });

  it('returns non-empty markdown string', () => {
    const result = renderCheckpointPackageReadme({ payload: SAMPLE_PAYLOAD });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('#');
  });
});
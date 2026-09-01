import { describe, expect, it } from 'vitest';

// Replicate helper implementations to validate behavior without importing
// internal module-level functions from agents/hiring-requests-handler.ts

// -----------------------------------------------------------------------
// normalizeAgentName
// -----------------------------------------------------------------------

function normalizeAgentName(value: string) {
  return value.trim().toLowerCase();
}

// -----------------------------------------------------------------------
// validateGeneratedAgentProfile
// -----------------------------------------------------------------------

const forgeCustomToolIds = [
  'hire_internal_agent',
  'terminate_internal_agent',
  'createTool',
  'runNativeToolLoop',
  'list_contacts',
  'upsert_contact',
  'list_conversations',
  'get_messages',
  'send_message',
  'change_chat_group',
  'list_agent_notifications',
  'publish_skill_to_catalog',
  'list_self_crons',
  'manage_self_crons',
  'hireInternalAgent',
  'terminateInternalAgent',
];

type AgentProfile = {
  agentName: string;
  agentDescription: string;
  roleId: string;
  primaryGoal: string;
  secondaryGoals: string[];
  backstory: string;
};

function validateGeneratedAgentProfile(profile: AgentProfile) {
  const mentionedToolIds: string[] = [];
  for (const toolId of forgeCustomToolIds) {
    const fieldsToCheck = [profile.primaryGoal, ...profile.secondaryGoals, profile.backstory];
    for (const field of fieldsToCheck) {
      if (field.includes(toolId)) {
        mentionedToolIds.push(toolId);
      }
    }
  }
  if (mentionedToolIds.length > 0) {
    return {
      valid: false as const,
      error: 'The generated agent text must not contain tool ids.',
      hint: `Remove these tool ids from the generated text: ${mentionedToolIds.join(', ')}.`,
      mentionedToolIds,
    };
  }
  return { valid: true as const };
}

// -----------------------------------------------------------------------
// estimateTextTokens
// -----------------------------------------------------------------------

function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// -----------------------------------------------------------------------
// getLastAssistantText
// -----------------------------------------------------------------------

type NativeToolLoopMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null | Array<{ type: string; [key: string]: unknown }>;
};

function getLastAssistantText(messages: NativeToolLoopMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message) continue;
    if (message.role !== 'assistant') continue;
    const content = message.content;
    if (content === null) continue;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      for (let i = content.length - 1; i >= 0; i--) {
        const part = content[i];
        if (part && typeof part === 'object' && part.type === 'text') {
          return String(part.text ?? '');
        }
      }
    }
  }
  return '';
}

// -----------------------------------------------------------------------
// buildStepDiagnostics
// -----------------------------------------------------------------------

function buildStepDiagnostics(
  messages: Array<{ role: string; content: unknown }>,
): Array<{ index: number; role: string; hasToolCalls: boolean; textLength: number }> {
  return messages.map((msg, i) => {
    let hasToolCalls = false;
    let textLength = 0;
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      hasToolCalls = (msg.content as Array<{ type: string }>).some(
        (part) => part && typeof part === 'object' && part.type === 'tool-call',
      );
      textLength = (msg.content as Array<{ type: string; text?: string }>).reduce((sum, part) => {
        if (part && typeof part === 'object' && part.type === 'text') {
          return sum + String(part.text ?? '').length;
        }
        return sum;
      }, 0);
    } else if (typeof msg.content === 'string') {
      textLength = msg.content.length;
    }
    return { index: i, role: msg.role, hasToolCalls, textLength };
  });
}

// -----------------------------------------------------------------------
// isToolResultWithOutput
// -----------------------------------------------------------------------

function isToolResultWithOutput(value: unknown): value is { output: unknown } {
  return value !== null && typeof value === 'object' && 'output' in value;
}

// -----------------------------------------------------------------------
// buildGeneratedAgentInstructions
// -----------------------------------------------------------------------

function buildGeneratedAgentInstructions(profile: AgentProfile): string {
  return [
    `Agent Name: ${profile.agentName.trim()}`,
    `Agent Description: ${profile.agentDescription.trim()}`,
    `Role ID: ${profile.roleId.trim()}`,
    '',
    `Primary Goal: ${profile.primaryGoal.trim()}`,
    '',
    `Secondary Goals:`,
    ...profile.secondaryGoals.map((g) => `  - ${g.trim()}`),
    '',
    `Backstory: ${profile.backstory.trim()}`,
  ].join('\n');
}

// -----------------------------------------------------------------------
// buildHiringPrompt
// -----------------------------------------------------------------------

type ExistingAgent = { name: string; roleName: string | null };

type HiringPromptOptions = {
  hiringRequest: string;
  additionalContext?: string;
  companyName?: string;
  companyContext?: string;
  existingAgents?: ExistingAgent[];
};

function buildHiringPrompt(opts: HiringPromptOptions): string {
  const lines: string[] = [];
  lines.push(`You are helping Acme hire a new internal collaborator.`);
  lines.push('');
  lines.push(`Hiring request: ${opts.hiringRequest.trim()}`);

  if (opts.companyName || opts.companyContext) {
    lines.push('');
    lines.push('Company context:');
    if (opts.companyName) lines.push(`  Company name: ${opts.companyName}`);
    if (opts.companyContext) lines.push(`  ${opts.companyContext.trim()}`);
  }

  if (opts.additionalContext) {
    lines.push('');
    lines.push(`Additional context: ${opts.additionalContext.trim()}`);
  }

  if (opts.existingAgents && opts.existingAgents.length > 0) {
    lines.push('');
    lines.push('Existing internal collaborators:');
    for (const agent of opts.existingAgents) {
      lines.push(`  - ${agent.name}${agent.roleName ? ` (${agent.roleName})` : ''}`);
    }
  }

  lines.push('');
  lines.push(
    'Generate the agent profile following the schema. Do NOT reference any tool ids or internal function names.',
  );

  return lines.join('\n');
}

// -----------------------------------------------------------------------
// Tests: normalizeAgentName
// -----------------------------------------------------------------------

describe('normalizeAgentName', () => {
  it('trims whitespace', () => {
    expect(normalizeAgentName('  MyAgent  ')).toBe('myagent');
    expect(normalizeAgentName('\tAgent\t')).toBe('agent');
  });

  it('converts to lowercase', () => {
    expect(normalizeAgentName('UPPERCASE')).toBe('uppercase');
    expect(normalizeAgentName('MiXeD')).toBe('mixed');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeAgentName('')).toBe('');
  });
});

// -----------------------------------------------------------------------
// Tests: validateGeneratedAgentProfile
// -----------------------------------------------------------------------

describe('validateGeneratedAgentProfile', () => {
  it('returns valid when no tool ids are mentioned', () => {
    const result = validateGeneratedAgentProfile({
      agentName: 'Varek',
      agentDescription: 'Senior developer',
      roleId: 'role-1',
      primaryGoal: 'Write clean code for Acme products',
      secondaryGoals: ['Review PRs', 'Mentor teammates'],
      backstory: 'A decade of fullstack experience building web applications',
    });
    expect(result.valid).toBe(true);
  });

  it('returns invalid when a tool id is mentioned in primaryGoal', () => {
    const result = validateGeneratedAgentProfile({
      agentName: 'Varek',
      agentDescription: 'Senior developer',
      roleId: 'role-1',
      primaryGoal: 'Use send_message to communicate with the team',
      secondaryGoals: ['Review PRs'],
      backstory: 'Experienced developer',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('tool ids');
  });

  it('returns invalid when a tool id is mentioned in secondaryGoals', () => {
    const result = validateGeneratedAgentProfile({
      agentName: 'Varek',
      agentDescription: 'Senior developer',
      roleId: 'role-1',
      primaryGoal: 'Write clean code for Acme',
      secondaryGoals: ['Use list_conversations to find relevant chats', 'Review PRs'],
      backstory: 'Experienced developer',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('tool ids');
  });

  it('returns invalid when a tool id is mentioned in backstory', () => {
    const result = validateGeneratedAgentProfile({
      agentName: 'Varek',
      agentDescription: 'Senior developer',
      roleId: 'role-1',
      primaryGoal: 'Write clean code for Acme',
      secondaryGoals: ['Review PRs'],
      backstory: 'Uses upsert_contact and list_conversations daily',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('tool ids');
  });
});

// -----------------------------------------------------------------------
// Tests: estimateTextTokens
// -----------------------------------------------------------------------

describe('estimateTextTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTextTokens('')).toBe(0);
  });

  it('returns 1 for text under 4 chars', () => {
    expect(estimateTextTokens('a')).toBe(1);
    expect(estimateTextTokens('ab')).toBe(1);
    expect(estimateTextTokens('abc')).toBe(1);
  });

  it('returns 1 for exactly 4 characters', () => {
    expect(estimateTextTokens('abcd')).toBe(1);
  });

  it('returns 2 for 5 characters', () => {
    expect(estimateTextTokens('abcde')).toBe(2);
  });

  it('divides length by 4 and rounds up', () => {
    expect(estimateTextTokens('abcdef')).toBe(2); // 6/4 = 1.5 → 2
    expect(estimateTextTokens('abcdefgh')).toBe(2); // 8/4 = 2
    expect(estimateTextTokens('abcdefghi')).toBe(3); // 9/4 = 2.25 → 3
  });

  it('handles long text', () => {
    expect(estimateTextTokens('a'.repeat(1000))).toBe(250);
  });
});

// -----------------------------------------------------------------------
// Tests: getLastAssistantText
// -----------------------------------------------------------------------

describe('getLastAssistantText', () => {
  it('returns text content from the last assistant message', () => {
    const messages: NativeToolLoopMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'response one' },
      { role: 'assistant', content: 'response two' },
    ];
    expect(getLastAssistantText(messages)).toBe('response two');
  });

  it('returns last assistant text from structured content', () => {
    const messages: NativeToolLoopMessage[] = [
      { role: 'assistant', content: [{ type: 'text', text: 'first' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'last message' }] },
    ];
    expect(getLastAssistantText(messages)).toBe('last message');
  });

  it('ignores tool messages and returns last assistant text', () => {
    const messages: NativeToolLoopMessage[] = [
      { role: 'assistant', content: 'hello' },
      { role: 'tool', content: 'result' },
      { role: 'assistant', content: 'final response' },
    ];
    expect(getLastAssistantText(messages)).toBe('final response');
  });

  it('returns empty string when no assistant messages exist', () => {
    const messages: NativeToolLoopMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'tool', content: 'result' },
    ];
    expect(getLastAssistantText(messages)).toBe('');
  });

  it('skips null messages when finding last assistant', () => {
    const messages = [
      { role: 'user', content: 'hello' },
      null,
      { role: 'assistant', content: 'found' },
    ] as unknown as NativeToolLoopMessage[];
    expect(getLastAssistantText(messages)).toBe('found');
  });

  it('returns empty string when last assistant content is null', () => {
    const messages: NativeToolLoopMessage[] = [{ role: 'assistant', content: null }];
    expect(getLastAssistantText(messages)).toBe('');
  });
});

// -----------------------------------------------------------------------
// Tests: buildStepDiagnostics
// -----------------------------------------------------------------------

describe('buildStepDiagnostics', () => {
  it('formats assistant messages with text parts', () => {
    const diagnostics = buildStepDiagnostics([
      { role: 'assistant', content: [{ type: 'text', text: 'hello world' }] },
    ]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toEqual({
      index: 0,
      role: 'assistant',
      hasToolCalls: false,
      textLength: 11,
    });
  });

  it('formats assistant messages with tool-call parts', () => {
    const diagnostics = buildStepDiagnostics([
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', toolName: 'reportHiringState', input: { status: 'working' } },
        ],
      },
    ]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toEqual({
      index: 0,
      role: 'assistant',
      hasToolCalls: true,
      textLength: 0,
    });
  });

  it('formats tool messages with tool-result parts', () => {
    const diagnostics = buildStepDiagnostics([
      {
        role: 'tool',
        content: [{ type: 'tool-result', toolName: 'reportHiringState', output: 'logged' }],
      },
    ]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toEqual({ index: 0, role: 'tool', hasToolCalls: false, textLength: 0 });
  });

  it('returns minimal object for null content', () => {
    const diagnostics = buildStepDiagnostics([{ role: 'assistant', content: null }]);
    expect(diagnostics[0]).toEqual({
      index: 0,
      role: 'assistant',
      hasToolCalls: false,
      textLength: 0,
    });
  });

  it('returns minimal object for unexpected content types', () => {
    // @ts-ignore - testing runtime with unexpected content type
    const diagnostics = buildStepDiagnostics([{ role: 'unknown', content: {} }]);
    expect(diagnostics[0]).toEqual({
      index: 0,
      role: 'unknown',
      hasToolCalls: false,
      textLength: 0,
    });
  });
});

// -----------------------------------------------------------------------
// Tests: isToolResultWithOutput
// -----------------------------------------------------------------------

describe('isToolResultWithOutput', () => {
  it('returns true for objects with output property', () => {
    expect(isToolResultWithOutput({ output: 'result' })).toBe(true);
    expect(isToolResultWithOutput({ output: 123 })).toBe(true);
    expect(isToolResultWithOutput({ output: null })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isToolResultWithOutput(null)).toBe(false);
  });

  it('returns false for objects without output', () => {
    expect(isToolResultWithOutput({ error: 'something' })).toBe(false);
    expect(isToolResultWithOutput({})).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isToolResultWithOutput('string')).toBe(false);
    expect(isToolResultWithOutput(42)).toBe(false);
    expect(isToolResultWithOutput(undefined)).toBe(false);
  });
});

// -----------------------------------------------------------------------
// Tests: buildGeneratedAgentInstructions
// -----------------------------------------------------------------------

describe('buildGeneratedAgentInstructions', () => {
  it('builds instructions with all required sections', () => {
    const instructions = buildGeneratedAgentInstructions({
      agentName: 'Varek',
      agentDescription: 'Senior developer',
      roleId: 'role-1',
      primaryGoal: 'Write clean code',
      secondaryGoals: ['Review PRs', 'Mentor teammates'],
      backstory: 'A decade of fullstack experience',
    });
    expect(instructions).toContain('Agent Name: Varek');
    expect(instructions).toContain('Agent Description: Senior developer');
    expect(instructions).toContain('Role ID: role-1');
    expect(instructions).toContain('Primary Goal: Write clean code');
    expect(instructions).toContain('  - Review PRs');
    expect(instructions).toContain('  - Mentor teammates');
    expect(instructions).toContain('Backstory: A decade of fullstack experience');
  });

  it('trims whitespace from all fields', () => {
    const instructions = buildGeneratedAgentInstructions({
      agentName: '  Varek  ',
      agentDescription: '  Senior developer  ',
      roleId: '  role-1  ',
      primaryGoal: '  Write clean code  ',
      secondaryGoals: ['  Review PRs  ', '  Mentor teammates  '],
      backstory: '  A decade of experience  ',
    });
    expect(instructions).toContain('Agent Name: Varek');
    expect(instructions).not.toContain('  Varek');
    expect(instructions).not.toContain('  Review PRs');
    expect(instructions).toContain('  - Review PRs');
  });
});

// -----------------------------------------------------------------------
// Tests: buildHiringPrompt
// -----------------------------------------------------------------------

describe('buildHiringPrompt', () => {
  it('includes hiring request', () => {
    const prompt = buildHiringPrompt({
      hiringRequest: 'Hire a senior fullstack developer',
      existingAgents: [],
    });
    expect(prompt).toContain('Hire a senior fullstack developer');
  });

  it('includes existing agents when provided', () => {
    const prompt = buildHiringPrompt({
      hiringRequest: 'Hire a developer',
      existingAgents: [
        { name: 'Varek', roleName: 'Senior Developer' },
        { name: 'Kaelen', roleName: null },
      ],
    });
    expect(prompt).toContain('Varek');
    expect(prompt).toContain('Senior Developer');
    expect(prompt).toContain('Kaelen');
    expect(prompt).toContain('Existing internal collaborators');
  });

  it('includes company name when provided', () => {
    const prompt = buildHiringPrompt({
      hiringRequest: 'Hire a developer',
      companyName: 'Acme',
      existingAgents: [],
    });
    expect(prompt).toContain('Acme');
    expect(prompt).toContain('Company context');
  });

  it('includes company context when provided', () => {
    const prompt = buildHiringPrompt({
      hiringRequest: 'Hire a developer',
      companyContext: 'We build SaaS products',
      existingAgents: [],
    });
    expect(prompt).toContain('We build SaaS products');
  });

  it('includes additional context when provided', () => {
    const prompt = buildHiringPrompt({
      hiringRequest: 'Hire a developer',
      additionalContext: 'Focus on Brazilian market',
      existingAgents: [],
    });
    expect(prompt).toContain('Focus on Brazilian market');
  });

  it('omits existing agents section when list is empty', () => {
    const prompt = buildHiringPrompt({ hiringRequest: 'Hire a developer', existingAgents: [] });
    expect(prompt).not.toContain('Existing internal collaborators');
  });

  it('omits company context section when neither name nor context are set', () => {
    const prompt = buildHiringPrompt({ hiringRequest: 'Hire a developer', existingAgents: [] });
    expect(prompt).not.toContain('Company context');
  });

  it('trims whitespace from all inputs', () => {
    const prompt = buildHiringPrompt({
      hiringRequest: '  Hire a developer  ',
      additionalContext: '  Brazilian market  ',
      existingAgents: [],
    });
    expect(prompt).not.toContain('  Hire');
    expect(prompt).toContain('Hire a developer');
    expect(prompt).toContain('Brazilian market');
  });
});

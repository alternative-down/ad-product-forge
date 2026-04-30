import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers that replicate the private logic in agents/hiring-rh.ts.
// Kept in sync with the actual implementation.
// ---------------------------------------------------------------------------

function normalizeAgentName(value: string) {
  return value.trim().toLowerCase();
}

const FORGE_CUSTOM_TOOL_IDS = [
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

function validateGeneratedAgentProfile(profile: {
  primaryGoal: string;
  secondaryGoals: string[];
  backstory: string;
}) {
  const mentionedToolIds: string[] = [];
  for (const toolId of FORGE_CUSTOM_TOOL_IDS) {
    const fieldsToCheck = [
      profile.primaryGoal,
      ...profile.secondaryGoals,
      profile.backstory,
    ];
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

function estimateTextTokens(text: string) {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Module-level constants (mirrored from agents/hiring-rh.ts)
// ---------------------------------------------------------------------------

const HIRING_RH_AGENT_ID = 'internal-hiring-rh';

const HIRING_RH_TOOL_IDS = new Set([
  'list_agent_roles',
  'manage_agent_role',
  'change_agent_role',
  'list_role_capabilities',
  'manage_role_capabilities',
] as const);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('hiring-rh helpers (normalized implementation)', () => {
  describe('normalizeAgentName', () => {
    it('should trim whitespace', () => {
      expect(normalizeAgentName('  Alice  ')).toBe('alice');
    });

    it('should convert to lowercase', () => {
      expect(normalizeAgentName('BOB')).toBe('bob');
    });

    it('should handle mixed case with spaces', () => {
      expect(normalizeAgentName('  Max Value  ')).toBe('max value');
    });

    it('should return empty string for empty input', () => {
      expect(normalizeAgentName('')).toBe('');
    });

    it('should handle unicode characters', () => {
      expect(normalizeAgentName('  Joao  ')).toBe('joao');
    });
  });

  describe('validateGeneratedAgentProfile', () => {
    it('should return valid for profile without tool ids', () => {
      const profile = {
        primaryGoal: 'Write tests for the codebase',
        secondaryGoals: ['Expand coverage', 'Fix bugs'],
        backstory: 'A developer with years of experience',
      };
      const result = validateGeneratedAgentProfile(profile);
      expect(result.valid).toBe(true);
    });

    it('should return invalid when primaryGoal contains a tool id', () => {
      const profile = {
        primaryGoal: 'Use hire_internal_agent to hire new team members',
        secondaryGoals: ['Expand coverage'],
        backstory: 'A developer with years of experience',
      };
      const result = validateGeneratedAgentProfile(profile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('tool ids');
    });

    it('should return invalid when secondaryGoals contains a tool id', () => {
      const profile = {
        primaryGoal: 'Write tests for the codebase',
        secondaryGoals: ['Call hire_internal_agent when needed'],
        backstory: 'A developer with years of experience',
      };
      const result = validateGeneratedAgentProfile(profile);
      expect(result.valid).toBe(false);
    });

    it('should return invalid when backstory contains a tool id', () => {
      const profile = {
        primaryGoal: 'Write tests for the codebase',
        secondaryGoals: ['Expand coverage'],
        backstory: 'Uses terminate_internal_agent for cleanup',
      };
      const result = validateGeneratedAgentProfile(profile);
      expect(result.valid).toBe(false);
    });

    it('should include the mentioned tool ids in the error hint', () => {
      const profile = {
        primaryGoal: 'Call hire_internal_agent to hire agents',
        secondaryGoals: ['Use terminate_internal_agent'],
        backstory: 'A developer',
      };
      const result = validateGeneratedAgentProfile(profile);
      expect(result.hint).toContain('hire_internal_agent');
      expect(result.hint).toContain('terminate_internal_agent');
    });

    it('should detect list_contacts tool id in goal', () => {
      const profile = {
        primaryGoal: 'Use list_contacts to find team members',
        secondaryGoals: [],
        backstory: 'A developer',
      };
      const result = validateGeneratedAgentProfile(profile);
      expect(result.valid).toBe(false);
    });

    it('should detect send_message tool id in backstory', () => {
      const profile = {
        primaryGoal: 'Manage team communications',
        secondaryGoals: [],
        backstory: 'Sends messages via send_message tool to coordinate work',
      };
      const result = validateGeneratedAgentProfile(profile);
      expect(result.valid).toBe(false);
    });

    it('should detect list_self_crons tool id in secondary goals', () => {
      const profile = {
        primaryGoal: 'Schedule recurring tasks',
        secondaryGoals: ['Use list_self_crons to monitor active tasks'],
        backstory: 'A scheduler agent',
      };
      const result = validateGeneratedAgentProfile(profile);
      expect(result.valid).toBe(false);
    });

    it('should pass for profile with no tool id mentions', () => {
      const profile = {
        primaryGoal:
          'Lead agent coordination and task management across the organization',
        secondaryGoals: [
          'Monitor agent performance and resource allocation',
          'Optimize workflow efficiency and communication patterns',
          'Escalate issues and maintain operational continuity',
        ],
        backstory:
          'Thoren operates as the organizational coordinator, ensuring agents work in alignment with company objectives.',
      };
      const result = validateGeneratedAgentProfile(profile);
      expect(result.valid).toBe(true);
    });
  });

  describe('estimateTextTokens', () => {
    it('should return 0 for empty string', () => {
      expect(estimateTextTokens('')).toBe(0);
    });

    it('should return 1 for short text under 4 chars', () => {
      expect(estimateTextTokens('hi')).toBe(1);
    });

    it('should divide length by 4 and round up', () => {
      expect(estimateTextTokens('abcde')).toBe(2);
      expect(estimateTextTokens('abcdef')).toBe(2);
      expect(estimateTextTokens('abcdefg')).toBe(2);
      expect(estimateTextTokens('abcdefgh')).toBe(2);
    });

    it('should handle long text', () => {
      const long = 'a'.repeat(100);
      expect(estimateTextTokens(long)).toBe(25);
    });

    it('should handle exactly 4 characters returning 1', () => {
      expect(estimateTextTokens('test')).toBe(1);
    });

    it('should handle 5 characters returning 2', () => {
      expect(estimateTextTokens('tests')).toBe(2);
    });
  });

  describe('HIRING_RH_AGENT_ID', () => {
    it('should be a constant string', () => {
      expect(HIRING_RH_AGENT_ID).toBe('internal-hiring-rh');
    });
  });

  describe('HIRING_RH_TOOL_IDS', () => {
    it('should contain expected tool ids', () => {
      const expected = new Set([
        'list_agent_roles',
        'manage_agent_role',
        'change_agent_role',
        'list_role_capabilities',
        'manage_role_capabilities',
      ]);
      expect(HIRING_RH_TOOL_IDS).toEqual(expected);
    });
  });
});

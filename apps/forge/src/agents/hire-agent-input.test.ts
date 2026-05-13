import { describe, expect, it } from 'vitest';
import { HireInternalAgentInputSchema, validateHireInternalAgentInput } from './hire-agent';
import { ZodError } from 'zod';

function validBaseInput() {
  return {
    roleId: 'role-1',
    name: 'Test Agent',
    instructions: 'Do stuff every day',
    modelProfileId: 'profile-1',
    omModelProfileId: 'om-profile-1',
    workspaceBasePath: '/workspace/test-agent',
    weeklyBudgetUsd: 100,
    githubApps: { installForRepo: async () => {}, getInstallationId: async () => 'inst-1' } as any,
    emailMailboxes: null,
    coolify: null,
    schedules: {} as any,
    internalChat: {} as any,
  };
}

describe('HireInternalAgentInputSchema', () => {
  describe('name', () => {
    it('accepts a non-empty name', () => {
      const input = validBaseInput();
      expect(HireInternalAgentInputSchema.parse(input)).toMatchObject({ name: 'Test Agent' });
    });

    it('rejects an empty string name', () => {
      const input = { ...validBaseInput(), name: '' };
      expect(() => HireInternalAgentInputSchema.parse(input)).toThrow(ZodError);
    });

    it('rejects a missing name', () => {
      const { name, ...input } = validBaseInput();
      expect(() => HireInternalAgentInputSchema.parse(input)).toThrow(ZodError);
    });
  });

  describe('instructions', () => {
    it('accepts non-empty instructions', () => {
      const input = validBaseInput();
      expect(HireInternalAgentInputSchema.parse(input)).toMatchObject({
        instructions: 'Do stuff every day',
      });
    });

    it('rejects an empty string instructions', () => {
      const input = { ...validBaseInput(), instructions: '' };
      expect(() => HireInternalAgentInputSchema.parse(input)).toThrow(ZodError);
    });
  });

  describe('weeklyBudgetUsd', () => {
    it('accepts a positive budget', () => {
      const input = { ...validBaseInput(), weeklyBudgetUsd: 50 };
      expect(HireInternalAgentInputSchema.parse(input)).toMatchObject({ weeklyBudgetUsd: 50 });
    });

    it('accepts 0 budget', () => {
      const input = { ...validBaseInput(), weeklyBudgetUsd: 0 };
      expect(HireInternalAgentInputSchema.parse(input)).toMatchObject({ weeklyBudgetUsd: 0 });
    });

    it('rejects a negative budget', () => {
      const input = { ...validBaseInput(), weeklyBudgetUsd: -10 };
      expect(() => HireInternalAgentInputSchema.parse(input)).toThrow(ZodError);
    });
  });

  describe('roleId', () => {
    it('accepts a non-empty roleId', () => {
      const input = validBaseInput();
      expect(HireInternalAgentInputSchema.parse(input)).toMatchObject({ roleId: 'role-1' });
    });

    it('rejects an empty string roleId', () => {
      const input = { ...validBaseInput(), roleId: '' };
      expect(() => HireInternalAgentInputSchema.parse(input)).toThrow(ZodError);
    });
  });

  describe('modelProfileId', () => {
    it('rejects an empty string modelProfileId', () => {
      const input = { ...validBaseInput(), modelProfileId: '' };
      expect(() => HireInternalAgentInputSchema.parse(input)).toThrow(ZodError);
    });
  });

  describe('omModelProfileId', () => {
    it('rejects an empty string omModelProfileId', () => {
      const input = { ...validBaseInput(), omModelProfileId: '' };
      expect(() => HireInternalAgentInputSchema.parse(input)).toThrow(ZodError);
    });
  });

  describe('workspaceBasePath', () => {
    it('rejects an empty string workspaceBasePath', () => {
      const input = { ...validBaseInput(), workspaceBasePath: '' };
      expect(() => HireInternalAgentInputSchema.parse(input)).toThrow(ZodError);
    });
  });

  describe('optional fields', () => {
    it('accepts missing optional fields', () => {
      const { roleName, roleDescription, description, providerCredentials, agentId, workspaceFilesystem, workspaceSandbox, ...input } = validBaseInput() as any;
      const parsed = HireInternalAgentInputSchema.parse(input);
      expect(parsed.roleId).toBe('role-1');
    });

    it('accepts provided optional fields', () => {
      const input = {
        ...validBaseInput(),
        agentId: 'agent-custom-id',
        roleName: 'My Role',
        description: 'A helpful agent',
        providerCredentials: { 'anthropic': { apiKey: 'sk-test' } },
      };
      const parsed = HireInternalAgentInputSchema.parse(input);
      expect(parsed.agentId).toBe('agent-custom-id');
      expect(parsed.roleName).toBe('My Role');
    });
  });

  describe('validateHireInternalAgentInput', () => {
    it('returns the parsed input on success', () => {
      const input = validBaseInput();
      const result = validateHireInternalAgentInput(input);
      expect(result.name).toBe('Test Agent');
    });

    it('throws ZodError on invalid input', () => {
      expect(() => validateHireInternalAgentInput({})).toThrow(ZodError);
    });
  });
});
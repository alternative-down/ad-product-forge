/**
 * Tests for Pattern L typed Errors in agents/skills-tools module (D51 #6502 batch 23).
 *
 * Each test verifies:
 *   1. The thrown error is an instanceof the typed Error class
 *   2. The error code matches the expected discriminator
 *   3. The message text is preserved verbatim for backward compatibility
 *   4. Domain fields (agentId, skillName) are exposed on the error for downstream consumers
 *
 * See apps/forge/src/agents/skills-tools.errors.ts.
 */

import { describe, expect, it } from 'vitest';

import { AgentNotFoundError, InvalidSkillNameError } from './skills-tools.errors';

describe('skills-tools — Pattern L typed Errors (D51 #6502 batch 23)', () => {
  it('AgentNotFoundError captures agentId and preserves message', () => {
    const agentId = 'agent-42';
    const error = new AgentNotFoundError(agentId);
    expect(error).toBeInstanceOf(AgentNotFoundError);
    expect(error.code).toBe('AGENT_NOT_FOUND');
    expect(error.agentId).toBe(agentId);
    expect(error.message).toContain('Agent not found');
    expect(error.message).toContain(agentId);
  });

  it('InvalidSkillNameError captures skillName and preserves message', () => {
    const skillName = '../escape';
    const error = new InvalidSkillNameError(skillName);
    expect(error).toBeInstanceOf(InvalidSkillNameError);
    expect(error.code).toBe('INVALID_SKILL_NAME');
    expect(error.skillName).toBe(skillName);
    expect(error.message).toContain('Invalid skill name');
    expect(error.message).toContain(skillName);
  });
});

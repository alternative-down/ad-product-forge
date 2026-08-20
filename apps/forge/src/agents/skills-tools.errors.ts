/**
 * Typed Error subclasses for the agents/skills-tools module (Pattern L, D51 #6502 batch 23).
 *
 * Replaces 2 raw `throw new Error(...)` calls in skills-tools.ts with 2 typed Error
 * subclasses so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6502.
 *
 * Migration impact: 2 literal `throw new Error(...)` calls in
 * apps/forge/src/agents/skills-tools.ts collapse to 2 typed Error classes.
 * Message format is preserved verbatim for backward compatibility with
 * existing test substrings and #6015 L#NN-46 transaction semantics.
 *
 * Pattern reference: apps/forge/src/discord/errors.ts (D51 batch 21 — Aldric),
 * apps/forge/src/github/ops/errors.ts (D51 batch 20 — Aldric).
 */

export class AgentNotFoundError extends Error {
  readonly code = 'AGENT_NOT_FOUND' as const;
  readonly agentId: string;
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`);
    this.name = 'AgentNotFoundError';
    this.agentId = agentId;
  }
}

export class InvalidSkillNameError extends Error {
  readonly code = 'INVALID_SKILL_NAME' as const;
  readonly skillName: string;
  constructor(skillName: string) {
    super(`Invalid skill name: ${skillName}`);
    this.name = 'InvalidSkillNameError';
    this.skillName = skillName;
  }
}

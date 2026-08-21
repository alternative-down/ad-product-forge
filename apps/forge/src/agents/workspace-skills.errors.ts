/**
 * Typed Error subclasses for the agents/workspace-skills module (Pattern L, D52 #6502).
 *
 * Replaces 2 raw `throw new Error(...)` calls in workspace-skills.ts with 1 typed
 * Error subclass so consumers can use `err instanceof WorkspaceSkillInvalidNameError`.
 * Both throw sites in `deleteAgentWorkspaceSkill` produce the same message shape
 * (`Invalid skill name: <name>`), so a single typed Error class covers both.
 *
 * Distinct name chosen over `InvalidSkillNameError` (already declared in
 * skills-tools.errors.ts and global-skills.errors.ts) to avoid TS name-collision
 * when consumers import from multiple skill-related modules.
 *
 * Migration impact: 2 literal `throw new Error(...)` calls in
 * apps/forge/src/agents/workspace-skills.ts collapse to 1 typed Error class.
 * Message format preserved verbatim for backward compatibility.
 */

export class WorkspaceSkillInvalidNameError extends Error {
  readonly code = 'WORKSPACE_SKILL_INVALID_NAME' as const;
  readonly skillName: string;
  constructor(skillName: string) {
    super(`Invalid skill name: ${skillName}`);
    this.name = 'WorkspaceSkillInvalidNameError';
    this.skillName = skillName;
  }
}

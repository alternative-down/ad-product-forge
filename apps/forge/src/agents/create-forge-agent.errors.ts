/**
 * Typed Error subclasses for the agents/create-forge-agent module (Pattern L, D50 #6502 batch 7).
 *
 * Replaces 6 raw `throw new Error(...)` calls in create-forge-agent.ts with 1 typed Error
 * subclass using a `fieldName` discriminator. See #6502.
 *
 * Pattern reference: apps/forge/src/communication/internal-chat-service.errors.ts (D50 #6502 batch 6 by Kaelen),
 * apps/forge/src/coolify/polling-helpers.errors.ts (D50 #6502 batch 5 by Kaelen).
 *
 * Migration impact: 6 literal `throw new Error(...)` calls in
 * apps/forge/src/agents/create-forge-agent.ts (function requireCheckpointedOmLimits) collapse
 * to 1 typed Error class with fieldName discriminator. Message format is preserved for
 * backward compatibility with existing tests.
 *
 * The 6 throws all share the same pattern: `${fieldName} is required in agent runtime config.`
 * A discriminator-based design (1 class + fieldName) is preferred over 6 individual classes
 * because the throws form a tight cluster in `requireCheckpointedOmLimits` and differ only
 * in the field name string. This minimizes boilerplate while preserving type safety.
 */

export class AgentRuntimeConfigFieldMissingError extends Error {
  readonly code = 'AGENT_RUNTIME_CONFIG_FIELD_MISSING' as const;
  readonly fieldName: string;
  constructor(fieldName: string) {
    super(`${fieldName} is required in agent runtime config.`);
    this.name = 'AgentRuntimeConfigFieldMissingError';
    this.fieldName = fieldName;
  }
}

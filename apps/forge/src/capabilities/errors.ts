/**
 * Typed Error subclasses for the capabilities module (Pattern L, D50 cycle 2 batch 4).
 *
 * Replaces 7 raw `throw new Error(...)` calls in apps/forge/src/capabilities/store.ts
 * with 6 typed Error subclasses so consumers can use `err instanceof XError`
 * instead of parsing human-readable messages. See #6502 cycle 2 batch 4.
 *
 * Pattern reference:
 * - apps/forge/src/schedules/errors.ts (D49 #6522)
 * - apps/forge/src/minimax/errors.ts (D50 #6502 batch 1, Streak 209)
 * - apps/forge/src/llm/errors.ts (D50 #6502 batch 2, Streak 215)
 * - apps/forge/src/capabilities/role-errors.ts (D45 #6456 — original RoleHasAssignedAgentsError)
 *
 * Migration impact: 7 throw sites in store.ts collapse to 6 typed Error classes
 * (L370+L378 deduplicate into RoleIdRequiredError; L156 was already typed).
 * Message format preserved verbatim for backward compatibility with the 7
 * `toThrow(...)` assertions in store.test.ts.
 *
 * History: file renamed from `role-errors.ts` → `errors.ts` in D50 cycle 20
 * because the typed errors now cover both role and agent scope, not just role.
 */

export class RoleHasAssignedAgentsError extends Error {
  readonly code = 'ROLE_HAS_ASSIGNED_AGENTS' as const;
  readonly roleId: string;
  constructor(roleId: string) {
    super('Cannot delete role with assigned agents: ' + roleId);
    this.name = 'RoleHasAssignedAgentsError';
    this.roleId = roleId;
  }
}

export class RoleNotFoundError extends Error {
  readonly code = 'ROLE_NOT_FOUND' as const;
  readonly roleId: string;
  constructor(roleId: string) {
    super(`Role not found: ${roleId}`);
    this.name = 'RoleNotFoundError';
    this.roleId = roleId;
  }
}

export class RoleNameRequiredError extends Error {
  readonly code = 'ROLE_NAME_REQUIRED' as const;
  constructor() {
    super('Role name is required.');
    this.name = 'RoleNameRequiredError';
  }
}

export class RoleIdRequiredError extends Error {
  readonly code = 'ROLE_ID_REQUIRED' as const;
  readonly action: 'delete' | 'update';
  constructor(action: 'delete' | 'update') {
    super('roleId is required.');
    this.name = 'RoleIdRequiredError';
    this.action = action;
  }
}

export class RoleUpdateAtLeastOneFieldRequiredError extends Error {
  readonly code = 'ROLE_UPDATE_AT_LEAST_ONE_FIELD_REQUIRED' as const;
  constructor() {
    super('At least one field besides roleId must be provided.');
    this.name = 'RoleUpdateAtLeastOneFieldRequiredError';
  }
}

export class AgentNotFoundError extends Error {
  readonly code = 'AGENT_NOT_FOUND' as const;
  readonly agentId: string;
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`);
    this.name = 'AgentNotFoundError';
    this.agentId = agentId;
  }
}

export class AgentMissingRoleIdError extends Error {
  readonly code = 'AGENT_MISSING_ROLE_ID' as const;
  readonly agentId: string;
  constructor(agentId: string) {
    super(`Agent is missing roleId: ${agentId}`);
    this.name = 'AgentMissingRoleIdError';
    this.agentId = agentId;
  }
}

// ── Pattern L D51 #6502 batch 16: typed Errors for capabilities/runtime.ts ──
// See apps/forge/src/capabilities/runtime.ts for the source throw sites.
// Message strings preserved verbatim for backward compatibility with
// runtime.test.ts string-based assertions.

export class ParsedCredentialsShapeMismatchError extends Error {
  readonly code = 'PARSED_CREDENTIALS_SHAPE_MISMATCH' as const;
  constructor() {
    super('Parsed credentials do not match StoredCredentials shape');
    this.name = 'ParsedCredentialsShapeMismatchError';
  }
}

export class UpdateInternalChatProviderProfileCredentialsError extends Error {
  readonly code = 'UPDATE_INTERNAL_CHAT_PROVIDER_PROFILE_CREDENTIALS' as const;
  readonly agentId: string;
  readonly originalError: unknown;
  constructor(agentId: string, cause: unknown) {
    super(
      `updateInternalChatProviderProfile: failed to decrypt/parse credentials for agent ${agentId}: ${
        cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : String(cause).replace(/^Error: /, '')
      }`,
    );
    this.name = 'UpdateInternalChatProviderProfileCredentialsError';
    this.agentId = agentId;
    this.originalError = cause;
  }
}

export class UpdateInternalChatProviderProfileUpdateError extends Error {
  readonly code = 'UPDATE_INTERNAL_CHAT_PROVIDER_PROFILE_UPDATE' as const;
  readonly agentId: string;
  readonly originalError: unknown;
  constructor(agentId: string, cause: unknown) {
    super(
      `updateInternalChatProviderProfile: failed to update provider for agent ${agentId}: ${
        cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : String(cause).replace(/^Error: /, '')
      }`,
    );
    this.name = 'UpdateInternalChatProviderProfileUpdateError';
    this.agentId = agentId;
    this.originalError = cause;
  }
}

export class ChangeAgentRolePermissionError extends Error {
  readonly code = 'CHANGE_AGENT_ROLE_PERMISSION' as const;
  readonly actorAgentId: string;
  readonly targetAgentId: string;
  constructor(actorAgentId: string, targetAgentId: string) {
    super(`Agent ${actorAgentId} cannot change role for ${targetAgentId}`);
    this.name = 'ChangeAgentRolePermissionError';
    this.actorAgentId = actorAgentId;
    this.targetAgentId = targetAgentId;
  }
}

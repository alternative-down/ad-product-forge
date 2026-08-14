/**
 * Thrown by createCapabilityStore.deleteRole when the role still has agents
 * assigned. Replaces the legacy intersection-cast pattern with a typed Error
 * subclass (Pattern I, D45). Consumers should use
 * err instanceof RoleHasAssignedAgentsError instead of comparing err.code.
 */
export class RoleHasAssignedAgentsError extends Error {
  readonly code = 'ROLE_HAS_ASSIGNED_AGENTS' as const;
  constructor(roleId: string) {
    super('Cannot delete role with assigned agents: ' + roleId);
    this.name = 'RoleHasAssignedAgentsError';
  }
}

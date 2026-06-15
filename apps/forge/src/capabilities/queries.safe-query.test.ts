/**
 * Unit tests for the safeQuery helper in queries.ts.
 *
 * The helper is NOT exported (it's a private function), so we test it
 * indirectly by triggering error paths in the public query functions.
 * This file documents the BEHAVIOR contract of safeQuery:
 * - onError='return-fallback' (default): catch + log + return fallback
 * - onError='throw': catch + log + rethrow
 * - fallback can be a value or a thunk
 *
 * Combined with queries.lnn-13-tripwire.test.ts, this file gives full
 * coverage of the safeQuery contract from both runtime and source-level
 * angles.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { makeDbMock } from './test-utils/db-mock';
import {
  queryRoles,
  queryRole,
  queryToolPermissions,
  queryWorkflowPermissions,
  queryAgentsByRoleId,
  queryAgent,
  queryAgents,
  queryToolPermissionsBatch,
  queryWorkflowPermissionsBatch,
} from './queries';

function createRolesMock() {
  return {
    findMany: vi.fn<() => Promise<unknown[]>>(),
    findFirst: vi.fn<() => Promise<unknown | null>>(),
  };
}

function createAgentsMock() {
  return {
    findMany: vi.fn<() => Promise<unknown[]>>(),
    findFirst: vi.fn<() => Promise<unknown | null>>(),
  };
}

function createPermissionsMock() {
  return {
    findMany: vi.fn<() => Promise<unknown[]>>(),
  };
}

function createDb(overrides: {
  agentRoles?: ReturnType<typeof createRolesMock>;
  agents?: ReturnType<typeof createAgentsMock>;
  roleToolPermissions?: ReturnType<typeof createPermissionsMock>;
  roleWorkflowPermissions?: ReturnType<typeof createPermissionsMock>;
} = {}) {
  return makeDbMock({
    query: {
      agentRoles: overrides.agentRoles ?? createRolesMock(),
      agents: overrides.agents ?? createAgentsMock(),
      roleToolPermissions: overrides.roleToolPermissions ?? createPermissionsMock(),
      roleWorkflowPermissions: overrides.roleWorkflowPermissions ?? createPermissionsMock(),
    },
  } as any);
}

// ─── safeQuery contract: return-fallback (default) ────────────────────────

describe('safeQuery: return-fallback (default)', () => {
  it('queryRoles returns [] on error', async () => {
    const agentRoles = createRolesMock();
    agentRoles.findMany.mockRejectedValue(new Error('boom'));
    const result = await queryRoles(createDb({ agentRoles }));
    expect(result).toEqual([]);
  });

  it('queryRole returns null on error', async () => {
    const agentRoles = createRolesMock();
    agentRoles.findFirst.mockRejectedValue(new Error('boom'));
    const result = await queryRole(createDb({ agentRoles }), 'role-1');
    expect(result).toBeNull();
  });

  it('queryToolPermissions returns [] on error', async () => {
    const roleToolPermissions = createPermissionsMock();
    roleToolPermissions.findMany.mockRejectedValue(new Error('boom'));
    const result = await queryToolPermissions(createDb({ roleToolPermissions }), 'role-1');
    expect(result).toEqual([]);
  });

  it('queryWorkflowPermissions returns [] on error', async () => {
    const roleWorkflowPermissions = createPermissionsMock();
    roleWorkflowPermissions.findMany.mockRejectedValue(new Error('boom'));
    const result = await queryWorkflowPermissions(createDb({ roleWorkflowPermissions }), 'role-1');
    expect(result).toEqual([]);
  });

  it('queryAgents returns [] on error', async () => {
    const agents = createAgentsMock();
    agents.findMany.mockRejectedValue(new Error('boom'));
    const result = await queryAgents(createDb({ agents }), {});
    expect(result).toEqual([]);
  });
});

// ─── safeQuery contract: throw ───────────────────────────────────────────

describe('safeQuery: throw (onError="throw")', () => {
  it('queryAgentsByRoleId rethrows on error', async () => {
    const agents = createAgentsMock();
    agents.findFirst.mockRejectedValue(new Error('boom'));
    await expect(queryAgentsByRoleId(createDb({ agents }), 'role-1')).rejects.toThrow('boom');
  });

  it('queryAgent rethrows on error', async () => {
    const agents = createAgentsMock();
    agents.findFirst.mockRejectedValue(new Error('boom'));
    await expect(queryAgent(createDb({ agents }), 'agent-1')).rejects.toThrow('boom');
  });

  it('queryToolPermissionsBatch rethrows on error', async () => {
    const roleToolPermissions = createPermissionsMock();
    roleToolPermissions.findMany.mockRejectedValue(new Error('boom'));
    await expect(queryToolPermissionsBatch(createDb({ roleToolPermissions }), ['role-1'])).rejects.toThrow('boom');
  });

  it('queryWorkflowPermissionsBatch rethrows on error', async () => {
    const roleWorkflowPermissions = createPermissionsMock();
    roleWorkflowPermissions.findMany.mockRejectedValue(new Error('boom'));
    await expect(queryWorkflowPermissionsBatch(createDb({ roleWorkflowPermissions }), ['role-1'])).rejects.toThrow('boom');
  });
});

// ─── safeQuery contract: error logging ───────────────────────────────────

describe('safeQuery: error logging', () => {
  it('logs error to forgeDebug on queryRoles failure', async () => {
    const { forgeDebug } = await import('@forge-runtime/core');
    const agentRoles = createRolesMock();
    agentRoles.findMany.mockRejectedValue(new Error('boom'));
    await queryRoles(createDb({ agentRoles }));
    expect(forgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'capabilities-queries',
        level: 'error',
        message: expect.stringContaining('queryRoles failed'),
      }),
    );
  });
});

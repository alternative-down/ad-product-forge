/**
 * Unit tests for admin/routes/schemas/roles.ts.
 * Zod validation schemas for role management.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import {
  createRoleSchema,
  deleteRoleSchema,
  roleCapabilitySchema,
  roleToolPermissionSchema,
  roleWorkflowPermissionSchema,
  updateRoleSchema,
} from './roles';

// ─── roleToolPermissionSchema ─────────────────────────────────────────────

describe('roleToolPermissionSchema', () => {
  it('parses valid input', () => {
    expect(roleToolPermissionSchema.parse({ roleId: 'role-1', toolId: 'tool-1' })).toMatchObject({
      roleId: 'role-1',
      toolId: 'tool-1',
    });
  });

  it('rejects missing roleId', () => {
    expect(() => roleToolPermissionSchema.parse({ toolId: 't' })).toThrow();
  });

  it('rejects missing toolId', () => {
    expect(() => roleToolPermissionSchema.parse({ roleId: 'r' })).toThrow();
  });

  it('rejects empty roleId', () => {
    expect(() => roleToolPermissionSchema.parse({ roleId: '', toolId: 't' })).toThrow();
  });

  it('rejects empty toolId', () => {
    expect(() => roleToolPermissionSchema.parse({ roleId: 'r', toolId: '' })).toThrow();
  });
});

// ─── roleWorkflowPermissionSchema ─────────────────────────────────────────

describe('roleWorkflowPermissionSchema', () => {
  it('parses valid input', () => {
    expect(
      roleWorkflowPermissionSchema.parse({ roleId: 'role-1', workflowId: 'wf-1' }),
    ).toMatchObject({ roleId: 'role-1', workflowId: 'wf-1' });
  });

  it('rejects missing roleId', () => {
    expect(() => roleWorkflowPermissionSchema.parse({ workflowId: 'w' })).toThrow();
  });

  it('rejects missing workflowId', () => {
    expect(() => roleWorkflowPermissionSchema.parse({ roleId: 'r' })).toThrow();
  });
});

// ─── roleCapabilitySchema ─────────────────────────────────────────────────

describe('roleCapabilitySchema', () => {
  it('parses valid input', () => {
    expect(roleCapabilitySchema.parse({ roleId: 'role-1', capabilityId: 'cap-1' })).toMatchObject({
      roleId: 'role-1',
      capabilityId: 'cap-1',
    });
  });

  it('rejects missing roleId', () => {
    expect(() => roleCapabilitySchema.parse({ capabilityId: 'c' })).toThrow();
  });

  it('rejects missing capabilityId', () => {
    expect(() => roleCapabilitySchema.parse({ roleId: 'r' })).toThrow();
  });
});

// ─── createRoleSchema ──────────────────────────────────────────────────────

describe('createRoleSchema', () => {
  it('parses minimal valid input', () => {
    const result = createRoleSchema.parse({ name: 'Admin' });
    expect(result.name).toBe('Admin');
  });

  it('parses with optional description', () => {
    const result = createRoleSchema.parse({ name: 'Admin', description: 'Full system access' });
    expect(result.description).toBe('Full system access');
  });

  it('rejects missing name', () => {
    expect(() => createRoleSchema.parse({})).toThrow();
  });

  it('rejects empty name', () => {
    expect(() => createRoleSchema.parse({ name: '' })).toThrow();
  });
});

// ─── updateRoleSchema ─────────────────────────────────────────────────────

describe('updateRoleSchema', () => {
  it('parses roleId only', () => {
    const result = updateRoleSchema.parse({ roleId: 'r' });
    expect(result.roleId).toBe('r');
  });

  it('parses all fields', () => {
    const result = updateRoleSchema.parse({
      roleId: 'r',
      name: 'NewName',
      description: null,
    });
    expect(result.roleId).toBe('r');
    expect(result.name).toBe('NewName');
    expect(result.description).toBeNull();
  });

  it('rejects missing roleId', () => {
    expect(() => updateRoleSchema.parse({ name: 'x' })).toThrow();
  });

  it('rejects empty roleId', () => {
    expect(() => updateRoleSchema.parse({ roleId: '' })).toThrow();
  });
});

// ─── deleteRoleSchema ─────────────────────────────────────────────────────

describe('deleteRoleSchema', () => {
  it('parses valid input', () => {
    expect(deleteRoleSchema.parse({ roleId: 'role-1' })).toMatchObject({ roleId: 'role-1' });
  });

  it('rejects missing roleId', () => {
    expect(() => deleteRoleSchema.parse({})).toThrow();
  });

  it('rejects empty roleId', () => {
    expect(() => deleteRoleSchema.parse({ roleId: '' })).toThrow();
  });
});

// ─── safeParse (non-throwing) ─────────────────────────────────────────────

describe('schema.safeParse', () => {
  it('roleToolPermissionSchema safeParse returns success false for missing toolId', () => {
    const result = roleToolPermissionSchema.safeParse({ roleId: 'r' });
    expect(result.success).toBe(false);
  });

  it('createRoleSchema safeParse returns success false for missing name', () => {
    const result = createRoleSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('updateRoleSchema safeParse returns success true for roleId only', () => {
    const result = updateRoleSchema.safeParse({ roleId: 'r' });
    expect(result.success).toBe(true);
  });

  it('deleteRoleSchema safeParse returns success false for empty roleId', () => {
    const result = deleteRoleSchema.safeParse({ roleId: '' });
    expect(result.success).toBe(false);
  });
});

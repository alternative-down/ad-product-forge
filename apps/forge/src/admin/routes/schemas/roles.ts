import { z } from 'zod';

// fallow-ignore-next-line unused-export
export const roleToolPermissionSchema = z.object({
  roleId: z.string().min(1),
  toolId: z.string().min(1),
});

// fallow-ignore-next-line unused-export
export const roleWorkflowPermissionSchema = z.object({
  roleId: z.string().min(1),
  workflowId: z.string().min(1),
});

// fallow-ignore-next-line unused-export
export const roleCapabilitySchema = z.object({
  roleId: z.string().min(1),
  capabilityId: z.string().min(1),
});

// fallow-ignore-next-line unused-export
export const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

// fallow-ignore-next-line unused-export
export const updateRoleSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

// fallow-ignore-next-line unused-export
export const deleteRoleSchema = z.object({
  roleId: z.string().min(1),
});

// =============================================================================
// SCHEDULE SCHEMAS
// =============================================================================

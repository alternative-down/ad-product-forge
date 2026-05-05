import { z } from 'zod';

const roleToolPermissionSchema = z.object({
  roleId: z.string().min(1),
  toolId: z.string().min(1),
});

const roleWorkflowPermissionSchema = z.object({
  roleId: z.string().min(1),
  workflowId: z.string().min(1),
});

const roleCapabilitySchema = z.object({
  roleId: z.string().min(1),
  capabilityId: z.string().min(1),
});

const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const updateRoleSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

const deleteRoleSchema = z.object({
  roleId: z.string().min(1),
});

// =============================================================================
// SCHEDULE SCHEMAS
// =============================================================================

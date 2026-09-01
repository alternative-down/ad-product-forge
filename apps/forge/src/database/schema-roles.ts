import {
  integer,

  sqliteTable,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
import { InferModel } from 'drizzle-orm';

export const agentRoles = sqliteTable(
  'agent_roles',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    agentRolesNameIdx: uniqueIndex('agent_roles_name_idx').on(table.name),
  }),
);

export type AgentRole = InferModel<typeof agentRoles>;
export type NewAgentRole = InferModel<typeof agentRoles, 'insert'>;

export const roleToolPermissions = sqliteTable(
  'role_tool_permissions',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => agentRoles.id, { onDelete: 'cascade' }),
    toolId: text('tool_id').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    roleToolPermissionsUniqueIdx: uniqueIndex('role_tool_permissions_unique_idx').on(
      table.roleId,
      table.toolId,
    ),
    roleToolPermissionsRoleIdIdx: index('role_tool_permissions_role_id_idx').on(table.roleId),
  }),
);

export type RoleToolPermission = InferModel<typeof roleToolPermissions>;
export type NewRoleToolPermission = InferModel<typeof roleToolPermissions, 'insert'>;

export const roleWorkflowPermissions = sqliteTable(
  'role_workflow_permissions',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => agentRoles.id, { onDelete: 'cascade' }),
    workflowId: text('workflow_id').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    roleWorkflowPermissionsUniqueIdx: uniqueIndex('role_workflow_permissions_unique_idx').on(
      table.roleId,
      table.workflowId,
    ),
    roleWorkflowPermissionsRoleIdIdx: index('role_workflow_permissions_role_id_idx').on(
      table.roleId,
    ),
  }),
);

export type RoleWorkflowPermission = InferModel<typeof roleWorkflowPermissions>;
export type NewRoleWorkflowPermission = InferModel<typeof roleWorkflowPermissions, 'insert'>;

export type RoleItem = {
  roleId: string;
  name: string;
  description?: string | null;
  assignedAgentCount: number;
  toolIds: string[];
  workflowIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type RolesResponse = {
  availableToolIds: string[];
  availableWorkflowIds: string[];
  items: RoleItem[];
};

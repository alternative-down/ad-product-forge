export type RoleItem = {
  roleId: string;
  name: string;
  description?: string | null;
  assignedAgentCount: number;
  capabilityIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type RolesResponse = {
  availableCapabilityIds: string[];
  items: RoleItem[];
};

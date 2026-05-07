import type {Database} from '../database/client'

export interface InternalChatGroupsAccountDeps {
  addMemberToGroupByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
    role?: string;
  }): Promise<{ success: boolean }>;

  updateMemberRoleByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
    role: string;
  }): Promise<{ success: boolean; role: string }>;

  removeMemberFromGroupByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
  }): Promise<{ success: boolean }>;

  updateGroupByAccount(input: {
    accountId: string;
    groupId: string;
    name?: string;
    conversationKey?: string;
  }): Promise<{ success: boolean; name?: string }>;
}

export function createInternalChatGroupsAccount(_db: Database, deps: InternalChatGroupsAccountDeps) {
  async function addMemberToGroupByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
    role?: string;
  }) {
    return deps.addMemberToGroupByAccount(input);
  }

  async function updateMemberRoleByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
    role: string;
  }) {
    return deps.updateMemberRoleByAccount(input);
  }

  async function removeMemberFromGroupByAccount(input: {
    accountId: string;
    groupId: string;
    participantAccountId: string;
  }) {
    return deps.removeMemberFromGroupByAccount(input);
  }

  async function updateGroupByAccount(input: {
    accountId: string;
    groupId: string;
    name?: string;
    conversationKey?: string;
  }) {
    return deps.updateGroupByAccount(input);
  }

  return {
    addMemberToGroupByAccount,
    updateMemberRoleByAccount,
    removeMemberFromGroupByAccount,
    updateGroupByAccount,
  };
}

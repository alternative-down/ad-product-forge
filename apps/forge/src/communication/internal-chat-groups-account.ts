import type { Database } from '../database/client';

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

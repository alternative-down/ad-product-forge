/**
 * Unit tests for communication/internal-chat-groups-account.ts.
 * createInternalChatGroupsAccount — addMemberToGroupByAccount,
 * updateMemberRoleByAccount, removeMemberFromGroupByAccount,
 * updateGroupByAccount.
 * Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInternalChatGroupsAccount } from './internal-chat-groups-account';
import type { InternalChatGroupsAccountDeps } from './internal-chat-groups-account';

function makeMockDeps() {
  return {
    addMemberToGroupByAccount: vi.fn<() => Promise<{ success: boolean }>>(),
    updateMemberRoleByAccount: vi.fn<() => Promise<{ success: boolean; role: string }>>(),
    removeMemberFromGroupByAccount: vi.fn<() => Promise<{ success: boolean }>>(),
    updateGroupByAccount: vi.fn<() => Promise<{ success: boolean; name?: string }>>(),
  };
}

const DB = {} as Parameters<typeof createInternalChatGroupsAccount>[0];

// ─── addMemberToGroupByAccount ───────────────────────────────────────────────

describe('createInternalChatGroupsAccount — addMemberToGroupByAccount', () => {
  it('delegates to deps with all input fields', async () => {
    const deps = makeMockDeps();
    deps.addMemberToGroupByAccount.mockResolvedValue({ success: true });
    const groups = createInternalChatGroupsAccount(DB, deps);

    const result = await groups.addMemberToGroupByAccount({
      accountId: 'acc-1',
      groupId: 'group-1',
      participantAccountId: 'acc-2',
      role: 'admin',
    });

    expect(result).toEqual({ success: true });
    expect(deps.addMemberToGroupByAccount).toHaveBeenCalledWith({
      accountId: 'acc-1',
      groupId: 'group-1',
      participantAccountId: 'acc-2',
      role: 'admin',
    });
  });

  it('passes through the result from deps', async () => {
    const deps = makeMockDeps();
    deps.addMemberToGroupByAccount.mockResolvedValue({ success: false });
    const groups = createInternalChatGroupsAccount(DB, deps);

    const result = await groups.addMemberToGroupByAccount({
      accountId: 'acc-1',
      groupId: 'group-1',
      participantAccountId: 'acc-2',
    });

    expect(result).toEqual({ success: false });
  });

  it('rethrows when deps.addMemberToGroupByAccount throws', async () => {
    const deps = makeMockDeps();
    deps.addMemberToGroupByAccount.mockRejectedValue(new Error('upstream failed'));
    const groups = createInternalChatGroupsAccount(DB, deps);

    await expect(
      groups.addMemberToGroupByAccount({
        accountId: 'acc-1',
        groupId: 'group-1',
        participantAccountId: 'acc-2',
      }),
    ).rejects.toThrow('upstream failed');
  });
});

// ─── updateMemberRoleByAccount ───────────────────────────────────────────────

describe('createInternalChatGroupsAccount — updateMemberRoleByAccount', () => {
  it('delegates to deps with all input fields', async () => {
    const deps = makeMockDeps();
    deps.updateMemberRoleByAccount.mockResolvedValue({ success: true, role: 'admin' });
    const groups = createInternalChatGroupsAccount(DB, deps);

    const result = await groups.updateMemberRoleByAccount({
      accountId: 'acc-1',
      groupId: 'group-1',
      participantAccountId: 'acc-2',
      role: 'admin',
    });

    expect(result).toEqual({ success: true, role: 'admin' });
    expect(deps.updateMemberRoleByAccount).toHaveBeenCalledWith({
      accountId: 'acc-1',
      groupId: 'group-1',
      participantAccountId: 'acc-2',
      role: 'admin',
    });
  });

  it('rethrows when deps.updateMemberRoleByAccount throws', async () => {
    const deps = makeMockDeps();
    deps.updateMemberRoleByAccount.mockRejectedValue(new Error('role update failed'));
    const groups = createInternalChatGroupsAccount(DB, deps);

    await expect(
      groups.updateMemberRoleByAccount({
        accountId: 'acc-1',
        groupId: 'group-1',
        participantAccountId: 'acc-2',
        role: 'normal',
      }),
    ).rejects.toThrow('role update failed');
  });
});

// ─── removeMemberFromGroupByAccount ─────────────────────────────────────────

describe('createInternalChatGroupsAccount — removeMemberFromGroupByAccount', () => {
  it('delegates to deps with all input fields', async () => {
    const deps = makeMockDeps();
    deps.removeMemberFromGroupByAccount.mockResolvedValue({ success: true });
    const groups = createInternalChatGroupsAccount(DB, deps);

    const result = await groups.removeMemberFromGroupByAccount({
      accountId: 'acc-1',
      groupId: 'group-1',
      participantAccountId: 'acc-2',
    });

    expect(result).toEqual({ success: true });
    expect(deps.removeMemberFromGroupByAccount).toHaveBeenCalledWith({
      accountId: 'acc-1',
      groupId: 'group-1',
      participantAccountId: 'acc-2',
    });
  });

  it('rethrows when deps.removeMemberFromGroupByAccount throws', async () => {
    const deps = makeMockDeps();
    deps.removeMemberFromGroupByAccount.mockRejectedValue(new Error('remove failed'));
    const groups = createInternalChatGroupsAccount(DB, deps);

    await expect(
      groups.removeMemberFromGroupByAccount({
        accountId: 'acc-1',
        groupId: 'group-1',
        participantAccountId: 'acc-2',
      }),
    ).rejects.toThrow('remove failed');
  });
});

// ─── updateGroupByAccount ─────────────────────────────────────────────────────

describe('createInternalChatGroupsAccount — updateGroupByAccount', () => {
  it('delegates to deps with all input fields', async () => {
    const deps = makeMockDeps();
    deps.updateGroupByAccount.mockResolvedValue({ success: true, name: 'Updated Name' });
    const groups = createInternalChatGroupsAccount(DB, deps);

    const result = await groups.updateGroupByAccount({
      accountId: 'acc-1',
      groupId: 'group-1',
      name: 'Updated Name',
      conversationKey: 'conv-1',
    });

    expect(result).toEqual({ success: true, name: 'Updated Name' });
    expect(deps.updateGroupByAccount).toHaveBeenCalledWith({
      accountId: 'acc-1',
      groupId: 'group-1',
      name: 'Updated Name',
      conversationKey: 'conv-1',
    });
  });

  it('passes through name from deps when not provided in input', async () => {
    const deps = makeMockDeps();
    deps.updateGroupByAccount.mockResolvedValue({ success: true });
    const groups = createInternalChatGroupsAccount(DB, deps);

    const result = await groups.updateGroupByAccount({
      accountId: 'acc-1',
      groupId: 'group-1',
    });

    expect(result).toEqual({ success: true });
    expect(deps.updateGroupByAccount).toHaveBeenCalledWith({
      accountId: 'acc-1',
      groupId: 'group-1',
    });
  });

  it('rethrows when deps.updateGroupByAccount throws', async () => {
    const deps = makeMockDeps();
    deps.updateGroupByAccount.mockRejectedValue(new Error('update failed'));
    const groups = createInternalChatGroupsAccount(DB, deps);

    await expect(
      groups.updateGroupByAccount({
        accountId: 'acc-1',
        groupId: 'group-1',
        name: 'New Name',
      }),
    ).rejects.toThrow('update failed');
  });
});

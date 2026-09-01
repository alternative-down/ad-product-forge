/**
 * Unit tests for communication/internal-chat-participants.ts.
 * createInternalChatParticipants — listGroupMembersOrDmPeers and
 * listGroupMembersOrDmPeersByAccount.
 * Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInternalChatParticipants } from './internal-chat-participants';

// ─── Mock DB factory ─────────────────────────────────────────────────────────

function makeMockDb(overrides?: {
  accountRows?: { id: string; agentId: string | null; slug: string; displayName: string }[];
  memberRows?: { accountId: string; agentId: string | null; slug: string; displayName: string }[];
  accountFindFirstError?: Error;
  dbSelectError?: Error;
}) {
  const memberRows = overrides?.memberRows ?? [];
  const accountRows = overrides?.accountRows ?? [];

  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockImplementation(async () => {
              if (overrides?.dbSelectError) throw overrides.dbSelectError;
              return memberRows;
            }),
          }),
        }),
      }),
    }),
    query: {
      internalChatAccounts: {
        findFirst: vi.fn().mockImplementation(async () => {
          if (overrides?.accountFindFirstError) throw overrides.accountFindFirstError;
          return accountRows[0] ?? null;
        }),
      },
    },
  };
}

const DB = {} as Parameters<typeof createInternalChatParticipants>[0];

// ─── listGroupMembersOrDmPeersByAccount ──────────────────────────────────────

describe('createInternalChatParticipants — listGroupMembersOrDmPeersByAccount', () => {
  it('returns member rows enriched with account info', async () => {
    const memberRows = [
      { accountId: 'acct-1', agentId: null, slug: 'alice', displayName: 'Alice' },
      { accountId: 'acct-2', agentId: null, slug: 'bob', displayName: 'Bob' },
    ];
    const db = makeMockDb({ memberRows });
    const participants = createInternalChatParticipants(db as never);

    const result = await participants.listGroupMembersOrDmPeersByAccount('acct-1', 'conv-1');

    expect(result).toHaveLength(2);
    expect(db.select).toHaveBeenCalled();
  });

  it('sorts requesting account first', async () => {
    const memberRows = [
      { accountId: 'acct-2', agentId: null, slug: 'bob', displayName: 'Bob' },
      { accountId: 'acct-1', agentId: null, slug: 'alice', displayName: 'Alice' },
    ];
    const db = makeMockDb({ memberRows });
    const participants = createInternalChatParticipants(db as never);

    const result = await participants.listGroupMembersOrDmPeersByAccount('acct-1', 'conv-1');

    expect(result[0].accountId).toBe('acct-1');
    expect(result[1].accountId).toBe('acct-2');
  });

  it('returns unsorted list when account not in members', async () => {
    const memberRows = [
      { accountId: 'acct-2', agentId: null, slug: 'bob', displayName: 'Bob' },
      { accountId: 'acct-3', agentId: null, slug: 'charlie', displayName: 'Charlie' },
    ];
    const db = makeMockDb({ memberRows });
    const participants = createInternalChatParticipants(db as never);

    const result = await participants.listGroupMembersOrDmPeersByAccount('acct-1', 'conv-1');

    expect(result).toHaveLength(2);
  });

  it('calls db.select with conversationId filter', async () => {
    const db = makeMockDb({ memberRows: [] });
    const participants = createInternalChatParticipants(db as never);

    await participants.listGroupMembersOrDmPeersByAccount('acct-1', 'conv-specific');

    expect(db.select).toHaveBeenCalled();
  });

  it('throws and logs via forgeDebug when db.select throws', async () => {
    const db = makeMockDb({ dbSelectError: new Error('select failed') });
    const participants = createInternalChatParticipants(db as never);

    await expect(
      participants.listGroupMembersOrDmPeersByAccount('acct-1', 'conv-1'),
    ).rejects.toThrow('select failed');
  });
});

// ─── listGroupMembersOrDmPeers ───────────────────────────────────────────────

describe('createInternalChatParticipants — listGroupMembersOrDmPeers', () => {
  it('returns [] when agent has no account', async () => {
    const db = makeMockDb({ accountRows: [] });
    const participants = createInternalChatParticipants(db as never);

    const result = await participants.listGroupMembersOrDmPeers('agent-unknown', 'conv-1');

    expect(result).toEqual([]);
  });

  it('resolves agentId to accountId then calls listGroupMembersOrDmPeersByAccount', async () => {
    const memberRows = [
      { accountId: 'acct-1', agentId: 'agent-1', slug: 'alice', displayName: 'Alice' },
    ];
    const accountRows = [{ id: 'acct-1', agentId: 'agent-1', slug: 'alice', displayName: 'Alice' }];
    const db = makeMockDb({ memberRows, accountRows });
    const participants = createInternalChatParticipants(db as never);

    const result = await participants.listGroupMembersOrDmPeers('agent-1', 'conv-1');

    expect(db.query.internalChatAccounts.findFirst).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('throws and logs via forgeDebug when account lookup throws', async () => {
    const db = makeMockDb({ accountFindFirstError: new Error('account lookup failed') });
    const participants = createInternalChatParticipants(db as never);

    await expect(participants.listGroupMembersOrDmPeers('agent-1', 'conv-1')).rejects.toThrow(
      'account lookup failed',
    );
  });

  it('returns empty list when agent has an account but no members', async () => {
    const accountRows = [{ id: 'acct-1', agentId: 'agent-1', slug: 'alice', displayName: 'Alice' }];
    const db = makeMockDb({ memberRows: [], accountRows });
    const participants = createInternalChatParticipants(db as never);

    const result = await participants.listGroupMembersOrDmPeers('agent-1', 'conv-empty');

    expect(result).toEqual([]);
  });
});

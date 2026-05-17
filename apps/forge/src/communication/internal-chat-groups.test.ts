import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInternalChatGroups,
  type InternalChatGroups,
} from "./internal-chat-groups";

// --------------------------------------------------------------------------
// Chain builder — makes awaitable + iterable query chains from mock results
// --------------------------------------------------------------------------
function createChain(result: unknown) {
  const chain: any = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    all: vi.fn(() => Promise.resolve(result)),
  };
  chain[Symbol.iterator] = function* () {
    yield* (result as unknown[]);
  };
  Object.defineProperty(chain, "then", {
    value: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled),
    configurable: true,
    writable: true,
  });
  return chain;
}

// --------------------------------------------------------------------------
// Mock DB factory
// --------------------------------------------------------------------------
function createMockDb(overrides?: {
  accounts?: unknown[];
  conversationById?: unknown | null;
  members?: unknown[];
  membership?: unknown | null;
}) {
  const accounts = overrides?.accounts ?? [];
  const conversationById = overrides?.conversationById ?? null;
  const members = overrides?.members ?? [];
  const membership = overrides?.membership ?? null;

  return {
    query: {
      internalChatAccounts: {
        findFirst: vi.fn().mockImplementation(({ where }) => {
          const cond = where as Record<string, unknown>;
          const id = cond["id"];
          if (id !== undefined) {
            return Promise.resolve(
              accounts.find((a) => (a as Record<string, unknown>).id === id) ?? null,
            );
          }
          const agentId = cond["agentId"];
          if (agentId !== undefined) {
            return Promise.resolve(
              accounts.find((a) => (a as Record<string, unknown>).agentId === agentId) ?? null,
            );
          }
          return Promise.resolve(null);
        }),
        findMany: vi.fn().mockResolvedValue(accounts),
      },
      internalChatConversations: {
        findFirst: vi.fn().mockResolvedValue(conversationById),
        findMany: vi.fn().mockResolvedValue([]),
      },
      internalChatConversationMembers: {
        findFirst: vi.fn().mockResolvedValue(membership),
        findMany: vi.fn().mockResolvedValue(members),
      },
      internalChatMessages: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      internalChatMessageAttachments: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      internalChatMessageReads: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    select: vi.fn(() => createChain([])),
    insert: vi.fn(() => ({ values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([{}]) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue({}),
      })),
      where: vi.fn().mockResolvedValue({}),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue({}),
    })),
    _txRef: null as unknown,
    _setupTransaction(dbRef: unknown) {
      this._txRef = dbRef;
    },
    transaction: (() => {
      let _db: unknown = null;
      const txFn: any = vi.fn((fn: (tx: unknown) => Promise<unknown>) => {
        const txDb = {
          ...(_db as Record<string, unknown>),
          insert: vi.fn(() => ({ values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([{}]) })),
          update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue({}) })) })),
          delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue({}) })),
        };
        return fn(txDb);
      }) as typeof txFn & { _setDb: (db: unknown) => void };
      txFn._setDb = (db: unknown) => { _db = db; };
      return txFn;
    })(),
  };
}

// --------------------------------------------------------------------------
// Mock deps factory
// --------------------------------------------------------------------------
function createMockDeps(accounts?: unknown[]) {
  const store = accounts ?? [];

  return {
    getRequiredAccount: vi.fn().mockImplementation((accountId: string) => {
      const found = store.find((a) => (a as Record<string, unknown>).id === accountId);
      if (!found) throw new Error(`Internal chat account not found: ${accountId}`);
      return Promise.resolve(found);
    }),
    getRequiredAgentAccount: vi.fn().mockImplementation((agentId: string) => {
      const found = store.find(
        (a) => (a as Record<string, unknown>).agentId === agentId,
      );
      if (!found) {
        throw new Error(`Internal chat account not found for agent: ${agentId}`);
      }
      return Promise.resolve(found);
    }),
    getRequiredAccountBySlug: vi.fn().mockImplementation((slug: string) => {
      const found = store.find(
        (a) => (a as Record<string, unknown>).slug === slug,
      );
      if (!found) throw new Error(`Internal chat account not found: ${slug}`);
      return Promise.resolve(found);
    }),
    getAccountByTargetKey: vi.fn().mockImplementation((targetKey: string) => {
      const found = store.find(
        (a) =>
          (a as Record<string, unknown>).agentId === targetKey ||
          (a as Record<string, unknown>).slug === targetKey,
      );
      return Promise.resolve(found ?? null);
    }),
  };
}

// --------------------------------------------------------------------------
// Shared fixtures
// --------------------------------------------------------------------------
const AGENT_ACCOUNT = {
  id: "acc_agent_1",
  agentId: "agent_001",
  slug: "varek",
  displayName: "Varek",
};

const EXTERNAL_ACCOUNT = {
  id: "acc_ext_1",
  agentId: null,
  slug: "alice",
  displayName: "Alice",
};

const GROUP_CONVERSATION = {
  id: "grp_test_1",
  type: "group" as const,
  name: "Test Group",
  createdByAccountId: "acc_agent_1",
  createdAt: 1710000000000,
  updatedAt: 1710000000000,
};

const DEFAULT_AGENT_MEMBERSHIP = {
  conversationId: "grp_test_1",
  accountId: "acc_agent_1",
  role: "admin",
  createdAt: 1710000000000,
};

const DM_CONVERSATION = {
  id: "dm_test_1",
  type: "dm" as const,
  name: null,
  createdByAccountId: "acc_agent_1",
  createdAt: 1710000000000,
  updatedAt: 1710000000000,
};

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------
describe("createInternalChatGroups", () => {
  let db: ReturnType<typeof createMockDb>;
  let deps: ReturnType<typeof createMockDeps>;
  let groups: InternalChatGroups;

  beforeEach(() => {
    db = createMockDb({ accounts: [AGENT_ACCOUNT, EXTERNAL_ACCOUNT] });
    db.transaction._setDb(db);
    deps = createMockDeps([AGENT_ACCOUNT, EXTERNAL_ACCOUNT]);

    // Default membership: agent belongs to GROUP_CONVERSATION as admin
    db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue({
      conversationId: "grp_test_1",
      accountId: "acc_agent_1",
      role: "admin",
      createdAt: 1710000000000,
    });
    groups = createInternalChatGroups(db as any, deps);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ------------------------------------------------------------------
  // createChatGroup
  // ------------------------------------------------------------------
  describe("createChatGroup", () => {
    it("creates a new group and adds creator as admin", async () => {
      db.query.internalChatConversations.findFirst = vi
        .fn()
        .mockResolvedValue(null);

      const result = await groups.createChatGroup({
        agentId: "agent_001",
        conversationKey: "grp_new_1",
        name: "My Group",
        creatorName: "Varek",
      });

      expect(result).toMatchObject({
        groupId: "grp_new_1",
        name: "My Group",
        provider: "internal-chat",
        conversationKey: "grp_new_1",
        creatorMember: {
          participantId: "acc_agent_1",
          participantName: "Varek",
          role: "admin",
        },
      });
      expect(db.insert).toHaveBeenCalled();
    });

    it("throws when group already exists", async () => {
      db.query.internalChatConversations.findFirst = vi
        .fn()
        .mockResolvedValue(GROUP_CONVERSATION);

      await expect(
        groups.createChatGroup({
          agentId: "agent_001",
          conversationKey: "grp_test_1",
          name: "Duplicate Group",
          creatorName: "Varek",
        }),
      ).rejects.toThrow("Chat group already exists");
    });

    it("throws when agent account not found", async () => {
      db.query.internalChatConversations.findFirst = vi
        .fn()
        .mockResolvedValue(null);

      await expect(
        groups.createChatGroup({
          agentId: "agent_unknown",
          conversationKey: "grp_new_2",
          name: "Group",
          creatorName: "Nobody",
        }),
      ).rejects.toThrow("Internal chat account not found for agent");
    });
  });

  // ------------------------------------------------------------------
  // addMemberToGroup
  // ------------------------------------------------------------------
  describe("addMemberToGroup", () => {
    beforeEach(() => {
      db.query.internalChatConversations.findFirst = vi
        .fn()
        .mockResolvedValue(GROUP_CONVERSATION);
      db.query.internalChatConversationMembers.findFirst = vi
        .fn()
        .mockResolvedValue(DEFAULT_AGENT_MEMBERSHIP);
    });

    it("adds a member to an existing group", async () => {
      // Override: target member not yet in group (for insert check)
      // Use mockResolvedValueOnce chain — preserves beforeEach mock for membership check
      db.query.internalChatConversationMembers.findFirst = vi
        .fn()
        .mockResolvedValueOnce({
          // First call: membership check in getRequiredGroupForAgent → getRequiredConversationForAgent → requireConversationMembershipByAccount
          conversationId: "grp_test_1",
          accountId: "acc_agent_1",
          role: "admin",
          createdAt: 1710000000000,
        })
        .mockResolvedValueOnce(null) // Second call: member-lookup check → null (member not yet in group)

      const result = await groups.addMemberToGroup({
        agentId: "agent_001",
        groupId: "grp_test_1",
        participantSlug: "alice",
      });

      expect(result).toMatchObject({
        groupId: "grp_test_1",
        participantSlug: "alice",
        participantId: "acc_ext_1",
        participantName: "Alice",
        role: "normal",
      });
    });

    it("adds member with admin role when specified", async () => {
      db.query.internalChatConversationMembers.findFirst = vi
        .fn()
        .mockResolvedValueOnce({
          conversationId: "grp_test_1",
          accountId: "acc_agent_1",
          role: "admin",
          createdAt: 1710000000000,
        })
        .mockResolvedValueOnce(null);

      const result = await groups.addMemberToGroup({
        agentId: "agent_001",
        groupId: "grp_test_1",
        participantSlug: "alice",
        role: "admin",
      });

      expect(result.role).toBe("admin");
    });

    it("throws when member already in group", async () => {
      db.query.internalChatConversationMembers.findFirst = vi
        .fn()
        .mockResolvedValue({
          conversationId: "grp_test_1",
          accountId: "acc_ext_1",
          role: "normal",
          createdAt: 1710000000000,
        });

      await expect(
        groups.addMemberToGroup({
          agentId: "agent_001",
          groupId: "grp_test_1",
          participantSlug: "alice",
        }),
      ).rejects.toThrow("Group member already exists");
    });

    it("throws when group does not exist", async () => {
      db.query.internalChatConversations.findFirst = vi
        .fn()
        .mockResolvedValue(null);

      await expect(
        groups.addMemberToGroup({
          agentId: "agent_001",
          groupId: "nonexistent",
          participantSlug: "alice",
        }),
      ).rejects.toThrow("Conversation not found");
    });
  });

  // ------------------------------------------------------------------
  // removeMemberFromGroup
  // ------------------------------------------------------------------
  describe("removeMemberFromGroup", () => {
    beforeEach(() => {
      db.query.internalChatConversations.findFirst = vi
        .fn()
        .mockResolvedValue(GROUP_CONVERSATION);
      db.query.internalChatConversationMembers.findFirst = vi
        .fn()
        .mockResolvedValue(DEFAULT_AGENT_MEMBERSHIP);
    });

    it("removes an existing member", async () => {
      // First call: membership check (agent is admin); Second call: find alice's membership for removal
      db.query.internalChatConversationMembers.findFirst = vi
        .fn()
        .mockResolvedValueOnce({
          conversationId: "grp_test_1",
          accountId: "acc_agent_1",
          role: "admin",
          createdAt: 1710000000000,
        })
        .mockResolvedValueOnce({
          conversationId: "grp_test_1",
          accountId: "acc_ext_1",
          role: "normal",
          createdAt: 1710000001000,
        });

      const result = await groups.removeMemberFromGroup({
        agentId: "agent_001",
        groupId: "grp_test_1",
        participantSlug: "alice",
      });

      expect(result).toMatchObject({
        success: true,
        groupId: "grp_test_1",
        participantSlug: "alice",
      });
    });

    it("throws when group does not exist", async () => {
      // First call: membership check passes; second: conversation lookup returns null
      db.query.internalChatConversationMembers.findFirst = vi
        .fn()
        .mockResolvedValueOnce({
          conversationId: "grp_test_1",
          accountId: "acc_agent_1",
          role: "admin",
          createdAt: 1710000000000,
        })
        .mockResolvedValueOnce(null);
      db.query.internalChatConversations.findFirst = vi.fn().mockResolvedValue(null);

      await expect(
        groups.removeMemberFromGroup({
          agentId: "agent_001",
          groupId: "nonexistent",
          participantSlug: "alice",
        }),
      ).rejects.toThrow("Conversation not found");
    });
  });

  // ------------------------------------------------------------------
  // changeChatGroup — update existing group
  // ------------------------------------------------------------------
  describe("changeChatGroup — update existing group", () => {
    beforeEach(() => {
      db.query.internalChatConversations.findFirst = vi
        .fn()
        .mockResolvedValue(GROUP_CONVERSATION);
      db.query.internalChatConversationMembers.findFirst = vi
        .fn()
        .mockResolvedValue({
          conversationId: "grp_test_1",
          accountId: "acc_agent_1",
          role: "admin",
          createdAt: 1710000000000,
        });
      db.query.internalChatConversationMembers.findMany = vi
        .fn()
        .mockResolvedValue([]);
    });

    it("updates group name when name is provided", async () => {
      const result = await groups.changeChatGroup({
        agentId: "agent_001",
        groupId: "grp_test_1",
        name: "Updated Name",
      });

      expect(result.groupId).toBe("grp_test_1");
      expect(result.provider).toBe("internal-chat");
      expect(result.conversationKey).toBe("grp_test_1");
    });

    it("throws when non-admin tries to update group", async () => {
      db.query.internalChatConversationMembers.findFirst = vi
        .fn()
        .mockResolvedValue({
          conversationId: "grp_test_1",
          accountId: "acc_agent_1",
          role: "normal",
          createdAt: 1710000000000,
        });

      await expect(
        groups.changeChatGroup({
          agentId: "agent_001",
          groupId: "grp_test_1",
          name: "New Name",
        }),
      ).rejects.toThrow("Only admins can update the group.");
    });

    it("removes members not in the desired list", async () => {
      // Capture the txDb inside the transaction
      let capturedTx: unknown = null;
      db.transaction = vi.fn((fn: (tx: unknown) => Promise<unknown>) => {
        const txDb = {
          query: {
            internalChatConversationMembers: {
              findMany: vi.fn().mockResolvedValue([
                {
                  conversationId: "grp_test_1",
                  accountId: "acc_agent_1",
                  role: "admin",
                  createdAt: 1710000000000,
                },
                {
                  conversationId: "grp_test_1",
                  accountId: "acc_ext_1",
                  role: "normal",
                  createdAt: 1710000000001,
                },
              ]),
            },
          },
          insert: vi.fn(() => ({ values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([{}]) })),
          update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue({}) })) })),
          delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue({}) })),
        };
        capturedTx = txDb;
        return fn(txDb);
      });

      // Mock call sequence: membership check → conversation lookup
      db.query.internalChatConversationMembers.findFirst = vi
        .fn()
        .mockResolvedValueOnce({
          conversationId: "grp_test_1",
          accountId: "acc_agent_1",
          role: "admin",
          createdAt: 1710000000000,
        })
        .mockResolvedValueOnce({
          conversationId: "grp_test_1",
          accountId: "acc_agent_1",
          role: "admin",
          createdAt: 1710000000000,
        });

      db.query.internalChatConversationMembers.findMany = vi
        .fn()
        .mockResolvedValue([
          {
            conversationId: "grp_test_1",
            accountId: "acc_agent_1",
            role: "admin",
            createdAt: 1710000000000,
          },
          {
            conversationId: "grp_test_1",
            accountId: "acc_ext_1",
            role: "normal",
            createdAt: 1710000000001,
          },
        ]);
      db.query.internalChatAccounts.findFirst = vi.fn().mockResolvedValue(AGENT_ACCOUNT);

      await groups.changeChatGroup({
        agentId: "agent_001",
        groupId: "grp_test_1",
        members: [{ participantKey: "agent_001", role: "admin" }],
      });

      expect(capturedTx).not.toBeNull();
      expect((capturedTx as Record<string, unknown>).delete).toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // changeChatGroup — create new group
  // ------------------------------------------------------------------
  describe("changeChatGroup — create new group", () => {
    beforeEach(() => {
      db.query.internalChatConversations.findFirst = vi
        .fn()
        .mockResolvedValue(null);
      db.query.internalChatConversationMembers.findMany = vi
        .fn()
        .mockResolvedValue([]);
    });

    it("creates a new group when groupId is not provided", async () => {
      const result = await groups.changeChatGroup({
        agentId: "agent_001",
        name: "Brand New Group",
      });

      expect(result.provider).toBe("internal-chat");
      expect(result.conversationKey).toBeDefined();
    });

    it("throws when creating without a name", async () => {
      await expect(
        groups.changeChatGroup({
          agentId: "agent_001",
        }),
      ).rejects.toThrow("name is required when creating a group.");
    });

    it("creates group with members when members list is provided", async () => {
      // Mock account lookups for both members in the list
      db.query.internalChatAccounts.findFirst = vi.fn().mockResolvedValue(AGENT_ACCOUNT);

      const result = await groups.changeChatGroup({
        agentId: "agent_001",
        name: "Group With Members",
        members: [
          { participantKey: "agent_001", role: "admin" },
          { participantKey: "alice", role: "normal" },
        ],
      });

      expect(result.provider).toBe("internal-chat");
    });
  });

  // ------------------------------------------------------------------
  // listChatGroups
  // ------------------------------------------------------------------
  describe("listChatGroups", () => {
    it("returns groups for the agent account", async () => {
      const groupRows = [
        { id: "grp_1", name: "Group One", createdAt: 1710000000000, updatedAt: 1710000000001 },
        { id: "grp_2", name: "Group Two", createdAt: 1710000000002, updatedAt: 1710000000003 },
      ];

      db.select = vi.fn(() => createChain(groupRows));

      const result = await groups.listChatGroups({ agentId: "agent_001", limit: 20 });

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ groupId: "grp_1", name: "Group One", provider: "internal-chat" });
    });

    it("returns empty array when agent has no groups", async () => {
      // Provide a valid account mock so getAgentAccountOrFail does not throw
      deps.getRequiredAgentAccount = vi.fn().mockResolvedValue({
        id: "acc_unknown",
        agentId: "agent_unknown",
        slug: "unknown",
        displayName: "Unknown Agent",
        type: "agent",
        createdAt: 1710000000000,
      });
      db.query.internalChatAccounts.findFirst = vi.fn().mockResolvedValue({
        id: "acc_unknown",
        agentId: "agent_unknown",
        slug: "unknown",
        displayName: "Unknown Agent",
        type: "agent",
        createdAt: 1710000000000,
      });
      db.select = vi.fn(() => createChain([]));

      const result = await groups.listChatGroups({ agentId: "agent_unknown", limit: 20 });

      expect(result).toHaveLength(0);
    });
  });

  // ------------------------------------------------------------------
  // listGroupMembers
  // ------------------------------------------------------------------
  describe("listGroupMembers", () => {
    beforeEach(() => {
      db.query.internalChatConversations.findFirst = vi
        .fn()
        .mockResolvedValue(GROUP_CONVERSATION);
      db.query.internalChatConversationMembers.findFirst = vi
        .fn()
        .mockResolvedValue(DEFAULT_AGENT_MEMBERSHIP);
    });

    it("returns members for a valid group", async () => {
      const memberRows = [
        { groupId: "grp_test_1", participantId: "acc_agent_1", participantKey: "agent_001", participantSlug: "varek", participantName: "Varek", role: "admin", createdAt: 1710000000000 },
        { groupId: "grp_test_1", participantId: "acc_ext_1", participantKey: "alice", participantSlug: "alice", participantName: "Alice", role: "normal", createdAt: 1710000000001 },
      ];

      db.select = vi.fn(() => createChain(memberRows));

      const result = await groups.listGroupMembers({ agentId: "agent_001", groupId: "grp_test_1" });

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ participantId: "acc_agent_1", role: "admin" });
    });

    it("throws when group not found", async () => {
      db.query.internalChatConversations.findFirst = vi.fn().mockResolvedValue(null);
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue(null);

      await expect(
        groups.listGroupMembers({ agentId: "agent_001", groupId: "nonexistent" }),
      ).rejects.toThrow("Conversation not found");
    });
  });

  // ------------------------------------------------------------------
  // listGroupMembersByAccount
  // ------------------------------------------------------------------
  describe("listGroupMembersByAccount", () => {
    beforeEach(() => {
      db.query.internalChatConversations.findFirst = vi.fn().mockResolvedValue(GROUP_CONVERSATION);
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue({
        conversationId: "grp_test_1",
        accountId: "acc_agent_1",
        role: "admin",
        createdAt: 1710000000000,
      });
    });

    it("returns members when account belongs to the group", async () => {
      db.select = vi.fn(() =>
        createChain([{ groupId: "grp_test_1", participantId: "acc_agent_1", participantKey: "agent_001", participantSlug: "varek", participantName: "Varek", role: "admin", createdAt: 1710000000000 }]),
      );

      const result = await groups.listGroupMembersByAccount({ accountId: "acc_agent_1", groupId: "grp_test_1" });

      expect(result).toHaveLength(1);
    });

    it("throws when account does not belong to the group", async () => {
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue(null);

      await expect(
        groups.listGroupMembersByAccount({ accountId: "acc_unknown", groupId: "grp_test_1" }),
      ).rejects.toThrow("Conversation not found");
    });
  });


  // ------------------------------------------------------------------
  // listGroupMembersOrDmPeersByAccount
  // ------------------------------------------------------------------
  describe("listGroupMembersOrDmPeersByAccount", () => {
    it("returns members for a group conversation", async () => {
      db.query.internalChatConversations.findFirst = vi.fn().mockResolvedValue(GROUP_CONVERSATION);
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue(DEFAULT_AGENT_MEMBERSHIP);
      db.select = vi.fn(() =>
        createChain([
          { participantId: "acc_agent_1", participantKey: "agent_001", participantSlug: "varek", participantName: "Varek", displayName: "Varek", role: "admin", createdAt: 1710000000000 },
          { participantId: "acc_ext_1", participantKey: "alice", participantSlug: "alice", participantName: "Alice", displayName: "Alice", role: "normal", createdAt: 1710000000001 },
        ]),
      );
      // sortParticipantsBySelfFirst calls getRequiredAccount for each participant
      db.query.internalChatAccounts.findFirst = vi.fn().mockImplementation(({ where }) => {
        const cond = where as Record<string, unknown>;
        const id = cond["id"];
        if (id !== undefined) {
          const accounts = [AGENT_ACCOUNT, EXTERNAL_ACCOUNT];
          return Promise.resolve(
            accounts.find((a) => (a as Record<string, unknown>).id === id) ?? null,
          );
        }
        return Promise.resolve(null);
      });

      const result = await groups.listGroupMembersOrDmPeersByAccount("acc_agent_1", "grp_test_1");

      expect(result).toHaveLength(2);
    });

    it("returns peers for a DM conversation", async () => {
      db.query.internalChatConversations.findFirst = vi.fn().mockResolvedValue(DM_CONVERSATION);
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue({
        conversationId: "dm_test_1",
        accountId: "acc_agent_1",
        role: "normal",
        createdAt: 1710000000000,
      });
      db.select = vi.fn(() =>
        createChain([
          { participantId: "acc_ext_1", participantKey: "alice", participantSlug: "alice", participantName: "Alice", role: "normal", createdAt: 1710000000000 },
        ]),
      );

      const result = await groups.listGroupMembersOrDmPeersByAccount("acc_agent_1", "dm_test_1");

      expect(result).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------------
  // requireConversationMembership
  // ------------------------------------------------------------------
  describe("requireConversationMembership", () => {
    it("does not throw when agent belongs to conversation", async () => {
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue({
        conversationId: "grp_test_1",
        accountId: "acc_agent_1",
        role: "admin",
        createdAt: 1710000000000,
      });

      await expect(
        groups.requireConversationMembership("agent_001", "grp_test_1"),
      ).resolves.toBeUndefined();
    });

    it("throws when agent does not belong to conversation", async () => {
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue(null);

      await expect(
        groups.requireConversationMembership("agent_001", "grp_test_1"),
      ).rejects.toThrow("Conversation not found");
    });

    it("throws when agent account not found", async () => {
      await expect(
        groups.requireConversationMembership("agent_unknown", "grp_test_1"),
      ).rejects.toThrow("Internal chat account not found for agent");
    });
  });

  // ------------------------------------------------------------------
  // requireConversationMembershipByAccount
  // ------------------------------------------------------------------
  describe("requireConversationMembershipByAccount", () => {
    it("does not throw when account belongs to conversation", async () => {
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue({
        conversationId: "grp_test_1",
        accountId: "acc_agent_1",
        role: "admin",
        createdAt: 1710000000000,
      });

      await expect(
        groups.requireConversationMembershipByAccount("acc_agent_1", "grp_test_1"),
      ).resolves.toBeUndefined();
    });

    it("throws when account does not belong to conversation", async () => {
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue(null);

      await expect(
        groups.requireConversationMembershipByAccount("acc_agent_1", "grp_test_1"),
      ).rejects.toThrow("Conversation not found");
    });
  });

  // ------------------------------------------------------------------
  // getRequiredConversationForAgent
  // ------------------------------------------------------------------
  describe("getRequiredConversationForAgent", () => {
    it("returns conversation when agent belongs to it", async () => {
      db.query.internalChatConversations.findFirst = vi.fn().mockResolvedValue(GROUP_CONVERSATION);
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue({
        conversationId: "grp_test_1",
        accountId: "acc_agent_1",
        role: "admin",
        createdAt: 1710000000000,
      });

      const result = await groups.getRequiredConversationForAgent("agent_001", "grp_test_1");

      expect(result.id).toBe("grp_test_1");
    });

    it("throws when conversation not found or agent not a member", async () => {
      db.query.internalChatConversations.findFirst = vi.fn().mockResolvedValue(null);

      await expect(
        groups.getRequiredConversationForAgent("agent_001", "nonexistent"),
      ).rejects.toThrow("Conversation not found");
    });
  });

  // ------------------------------------------------------------------
  // getRequiredGroupForAgent
  // ------------------------------------------------------------------
  describe("getRequiredGroupForAgent", () => {
    it("returns conversation when it is a group", async () => {
      db.query.internalChatConversations.findFirst = vi.fn().mockResolvedValue(GROUP_CONVERSATION);
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue({
        conversationId: "grp_test_1",
        accountId: "acc_agent_1",
        role: "admin",
        createdAt: 1710000000000,
      });

      const result = await groups.getRequiredGroupForAgent("agent_001", "grp_test_1");

      expect(result.id).toBe("grp_test_1");
    });

    it("throws when conversation is a DM (not a group)", async () => {
      db.query.internalChatConversations.findFirst = vi.fn().mockResolvedValue(DM_CONVERSATION);
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue({
        conversationId: "dm_test_1",
        accountId: "acc_agent_1",
        role: "normal",
        createdAt: 1710000000000,
      });

      await expect(
        groups.getRequiredGroupForAgent("agent_001", "dm_test_1"),
      ).rejects.toThrow("Chat group not found: dm_test_1");
    });

    it("throws when group does not exist", async () => {
      db.query.internalChatConversations.findFirst = vi.fn().mockResolvedValue(null);
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue(null);

      await expect(
        groups.getRequiredGroupForAgent("agent_001", "nonexistent"),
      ).rejects.toThrow("Conversation not found");
    });
  });

  describe('getRequiredConversationForAccount', () => {
    it('returns conversation when account belongs to it', async () => {
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue({
        conversationId: 'grp_test_1',
        accountId: 'acc_agent_1',
        role: 'normal',
        createdAt: 1710000000000,
      });
      db.query.internalChatConversations.findFirst = vi.fn().mockResolvedValue(GROUP_CONVERSATION);

      const result = await groups.getRequiredConversationForAccount('acc_agent_1', 'grp_test_1');

      expect(result).toEqual(GROUP_CONVERSATION);
    });

    it('throws when account does not belong to conversation', async () => {
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue(null);

      await expect(
        groups.getRequiredConversationForAccount('acc_agent_1', 'grp_test_1'),
      ).rejects.toThrow('Conversation not found: grp_test_1');
    });

    it('throws when conversation does not exist', async () => {
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue({
        conversationId: 'nonexistent',
        accountId: 'acc_agent_1',
        role: 'normal',
        createdAt: 1710000000000,
      });
      db.query.internalChatConversations.findFirst = vi.fn().mockResolvedValue(null);

      await expect(
        groups.getRequiredConversationForAccount('acc_agent_1', 'nonexistent'),
      ).rejects.toThrow('Conversation not found: nonexistent');
    });
  });

  describe('getRequiredGroupForAccount', () => {
    it('returns conversation when it is a group', async () => {
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue({
        conversationId: 'grp_test_1',
        accountId: 'acc_agent_1',
        role: 'normal',
        createdAt: 1710000000000,
      });
      db.query.internalChatConversations.findFirst = vi.fn().mockResolvedValue(GROUP_CONVERSATION);

      const result = await groups.getRequiredGroupForAccount('acc_agent_1', 'grp_test_1');

      expect(result).toEqual(GROUP_CONVERSATION);
    });

    it('throws when conversation is a DM (not a group)', async () => {
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue({
        conversationId: 'dm_test_1',
        accountId: 'acc_agent_1',
        role: 'normal',
        createdAt: 1710000000000,
      });
      db.query.internalChatConversations.findFirst = vi.fn().mockResolvedValue(DM_CONVERSATION);

      await expect(
        groups.getRequiredGroupForAccount('acc_agent_1', 'dm_test_1'),
      ).rejects.toThrow('Chat group not found: dm_test_1');
    });

    it('throws when group does not exist', async () => {
      db.query.internalChatConversationMembers.findFirst = vi.fn().mockResolvedValue(null);
      db.query.internalChatConversations.findFirst = vi.fn().mockResolvedValue(null);

      await expect(
        groups.getRequiredGroupForAccount('acc_agent_1', 'nonexistent'),
      ).rejects.toThrow('Conversation not found');
    });
  });

});

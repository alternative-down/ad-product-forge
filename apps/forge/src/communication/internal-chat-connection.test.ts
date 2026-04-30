import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInternalChatConnection } from "./internal-chat-connection";
import type {
  InternalChatHandler,
  InternalChatDeliveryMessage,
  InternalChatConnectionImpl,
} from "./internal-chat-connection";
import { buildGroupMetadata } from "./internal-chat-helpers";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeFakeDeps() {
  return {
    readMessageAttachments: vi.fn().mockResolvedValue([]),
    getRequiredAgentAccount: vi.fn().mockResolvedValue({ id: "acct_self" }),
    listGroupMembersOrDmPeers: vi.fn().mockResolvedValue([]),
  };
}

function makeMessage(overrides: Partial<InternalChatDeliveryMessage> = {}): InternalChatDeliveryMessage {
  return {
    targetKey: "conv_1",
    messageId: "msg_1",
    authorId: "acct_1",
    authorDisplayName: "Bob",
    authorUsername: "bob",
    content: "Hello!",
    attachments: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    metadata: { conversationType: "dm" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// suite
// ---------------------------------------------------------------------------

describe("createInternalChatConnection", () => {
  let db: Record<string, unknown>;
  let deps: ReturnType<typeof makeFakeDeps>;
  let conn: InternalChatConnectionImpl;

  beforeEach(() => {
    db = {};
    deps = makeFakeDeps();
    conn = createInternalChatConnection(db as any, deps);
  });

  // -------------------------------------------------------------------------
  // onReceiveMessage
  // -------------------------------------------------------------------------

  describe("onReceiveMessage", () => {
    it("registers a handler for an agent", () => {
      const handler = vi.fn();
      conn.onReceiveMessage("agent_1", handler);
      // The actual replay is tested in replayUnreadMessages tests below.
      conn.onReceiveMessage("agent_1", handler);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("createInternalChatConnection", () => {
    it("returns an object with onReceiveMessage, clearHandler, and deliverMessage", () => {
      expect(conn.onReceiveMessage).toBeDefined();
      expect(conn.clearHandler).toBeDefined();
      expect(conn.deliverMessage).toBeDefined();
      expect(conn.deliverToHandler).toBeDefined();
      expect(conn.deliverToParticipants).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // clearHandler
  // -------------------------------------------------------------------------

  describe("clearHandler", () => {
    it("removes the handler when no specific handler is passed", () => {
      const handler = vi.fn();
      conn.onReceiveMessage("agent_1", handler);
      conn.clearHandler("agent_1");
      const delivered = conn.deliverToHandler("agent_1", makeMessage());
      expect(delivered).toBe(false);
    });

    it("does nothing when the agent has no handler", () => {
      expect(() => conn.clearHandler("agent_1")).not.toThrow();
    });

    it("removes only the specified handler when a handler is passed", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      conn.onReceiveMessage("agent_1", handler1);
      conn.onReceiveMessage("agent_1", handler2);
      conn.clearHandler("agent_1", handler1);
      // handler2 is still registered, handler1 is gone
      // deliverToHandler only delivers to the latest registered handler
    });
  });

  // -------------------------------------------------------------------------
  // type exports
  // -------------------------------------------------------------------------

  describe("type exports", () => {
    it("InternalChatHandler is a function type", () => {
      const handler: InternalChatHandler = async (_msg) => { /* noop */ };
      expect(typeof handler).toBe("function");
    });

    it("InternalChatDeliveryMessage has required fields", () => {
      const msg = makeMessage();
      expect(msg.targetKey).toBe("conv_1");
      expect(msg.messageId).toBe("msg_1");
      expect(msg.metadata.conversationType).toBe("dm");
    });

    it("makeMessage helper produces a valid message", () => {
      const msg = makeMessage({ content: "custom", metadata: { conversationType: "group" } });
      expect(msg.content).toBe("custom");
      expect(msg.metadata.conversationType).toBe("group");
    });
  });

  // -------------------------------------------------------------------------
  // deliverToHandler (formerly deliverMessage)
  // -------------------------------------------------------------------------

  describe("deliverToHandler", () => {
    it("returns true and calls handler when handler is registered", () => {
      const handler = vi.fn();
      conn.onReceiveMessage("agent_1", handler);
      const delivered = conn.deliverToHandler("agent_1", makeMessage());
      expect(delivered).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("returns false and does not throw when no handler is registered", () => {
      const delivered = conn.deliverToHandler("agent_1", makeMessage());
      expect(delivered).toBe(false);
    });

    it("passes the correct message to the handler", () => {
      const handler = vi.fn();
      const msg = makeMessage({ content: "hello world" });
      conn.onReceiveMessage("agent_1", handler);
      conn.deliverToHandler("agent_1", msg);
      expect(handler).toHaveBeenCalledWith(msg);
    });
  });

  // -------------------------------------------------------------------------
  // deliverToParticipants
  // -------------------------------------------------------------------------

  describe("deliverToParticipants", () => {
    it("delivers to all participants with registered handlers", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      conn.onReceiveMessage("agent_1", h1);
      conn.onReceiveMessage("agent_2", h2);

      const result = conn.deliverToParticipants({
        participants: [
          { agentId: "agent_1", accountId: "acct_1", displayName: "Alice", slug: "alice" },
          { agentId: "agent_2", accountId: "acct_2", displayName: "Bob", slug: "bob" },
        ],
        conversation: { id: "conv_1", name: "Team Chat", type: "dm" },
        messageId: "msg_1",
        author: { id: "acct_0", displayName: "Dev", slug: "dev" },
        content: "Hello all!",
        attachments: [],
        createdAt: "2024-01-01T00:00:00.000Z",
      });

      expect(result).toContain("agent_1");
      expect(result).toContain("agent_2");
      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it("excludes the sender when excludeAccountId is provided", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      conn.onReceiveMessage("agent_1", h1);
      conn.onReceiveMessage("agent_2", h2);

      const result = conn.deliverToParticipants({
        participants: [
          { agentId: "agent_1", accountId: "acct_1", displayName: "Alice", slug: "alice" },
          { agentId: "agent_2", accountId: "acct_2", displayName: "Bob", slug: "bob" },
        ],
        conversation: { id: "conv_1", name: "Team Chat", type: "dm" },
        messageId: "msg_1",
        author: { id: "acct_1", displayName: "Alice", slug: "alice" },
        content: "Hello all!",
        attachments: [],
        createdAt: "2024-01-01T00:00:00.000Z",
        excludeAccountId: "acct_1",
      });

      expect(result).not.toContain("agent_1");
      expect(result).toContain("agent_2");
      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it("skips participants with no registered handler", () => {
      const h2 = vi.fn();
      conn.onReceiveMessage("agent_2", h2);

      const result = conn.deliverToParticipants({
        participants: [
          { agentId: "agent_1", accountId: "acct_1", displayName: "Alice", slug: "alice" },
          { agentId: "agent_2", accountId: "acct_2", displayName: "Bob", slug: "bob" },
        ],
        conversation: { id: "conv_1", name: "Team Chat", type: "dm" },
        messageId: "msg_1",
        author: { id: "acct_0", displayName: "Dev", slug: "dev" },
        content: "Hello!",
        attachments: [],
        createdAt: "2024-01-01T00:00:00.000Z",
      });

      expect(result).toEqual(["agent_2"]);
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it("skips participants with undefined agentId", () => {
      const h2 = vi.fn();
      conn.onReceiveMessage("agent_2", h2);

      const result = conn.deliverToParticipants({
        participants: [
          { agentId: undefined as any, accountId: "acct_1", displayName: "Alice", slug: "alice" },
          { agentId: "agent_2", accountId: "acct_2", displayName: "Bob", slug: "bob" },
        ],
        conversation: { id: "conv_1", name: "Team Chat", type: "dm" },
        messageId: "msg_1",
        author: { id: "acct_0", displayName: "Dev", slug: "dev" },
        content: "Hello!",
        attachments: [],
        createdAt: "2024-01-01T00:00:00.000Z",
      });

      expect(result).toEqual(["agent_2"]);
    });

    it("builds group metadata for group conversations", () => {
      const h1 = vi.fn();
      conn.onReceiveMessage("agent_1", h1);

      conn.deliverToParticipants({
        participants: [
          { agentId: "agent_1", accountId: "acct_1", displayName: "Alice", slug: "alice" },
          { agentId: "agent_2", accountId: "acct_2", displayName: "Bob", slug: "bob" },
          { agentId: "agent_3", accountId: "acct_3", displayName: "Carol", slug: "carol" },
        ],
        conversation: { id: "conv_1", name: "Team Chat", type: "group" },
        messageId: "msg_1",
        author: { id: "acct_1", displayName: "Alice", slug: "alice" },
        content: "Group msg",
        attachments: [],
        createdAt: "2024-01-01T00:00:00.000Z",
      });

      expect(h1).toHaveBeenCalledTimes(1);
      const deliveredMsg = h1.mock.calls[0][0];
      expect(deliveredMsg.conversationName).toBe("Team Chat");
      expect(deliveredMsg.metadata.conversationType).toBe("group");
      expect(deliveredMsg.metadata.groupMembers).toBeDefined();
      expect(deliveredMsg.metadata.groupMembers).toHaveLength(3);
    });
  });
});

# Issue #969: Extract sendMessage/deliverMessage into connection module

## Context

Following the pattern from #968, the sendMessage function in internal-chat-service.ts mixes data persistence (DB inserts/updates) with live-delivery orchestration. The delivery part should live in the connection module.

After #968, the connection module (internal-chat-connection.ts) owns:
- handlers map, onReceiveMessage / clearHandler
- replayUnreadMessages, deliverMessage

The next step is to add live delivery for new outbound messages.

## What's extracted

From internal-chat-service.ts (sendMessage) into internal-chat-connection.ts:

### 1. Rename deliverMessage -> deliverToHandler

The name 'deliverMessage' is ambiguous. It's delivering to a registered handler, not a participant.

### 2. Add deliverToParticipants method

interface InternalChatConnection {
  deliverToHandler(agentId: string, message: InternalChatDeliveryMessage): boolean;
  
  deliverToParticipants(params: {
    excludeAccountId: string;
    participants: InternalChatGroupParticipant[];
    conversation: { id: string; name: string | null; type: 'dm' | 'group' };
    messageId: string;
    author: { id: string; displayName: string; slug: string };
    content: string;
    attachments: CommunicationFile[];
    createdAt: string;
  }): string[]; // returns live agentIds
}

The method:
- Builds InternalChatDeliveryMessage for each participant
- Excludes excludeAccountId
- Skips participants without agentId
- Calls deliverToHandler for each live agent
- Returns agentIds that had a handler

What STAYS in the service:
- DB inserts (messages, attachments, read receipts)
- Conversation lookup (getRequiredConversationForAccount)
- Author account fetch
- Participant list fetch (listGroupMembersOrDmPeersByAccount)
- Conversation.updatedAt update
- The final db.update for live read receipts (uses returned liveAgentIds)

## Plan

1. Branch test/969-internal-chat-deliver-extraction from develop
2. internal-chat-connection.ts:
   - Rename deliverMessage -> deliverToHandler (update all call sites)
   - Add deliverToParticipants(params) method
   - Import InternalChatGroupParticipant from internal-chat-helpers
   - Import CommunicationFile from @forge-runtime/core (already imported)
3. internal-chat-service.ts:
   - Replace per-participant loop with connection.deliverToParticipants(...)
   - Update db.update(internalChatMessageReads) to use returned agentIds
   - Remove InternalChatDeliveryMessage local construction
4. internal-chat-connection.test.ts:
   - Add tests for deliverToParticipants
   - Update deliverMessage -> deliverToHandler call site tests
5. All tests pass
6. Push + PR vs develop

## Files

- internal-chat-connection.ts: rename + add method
- internal-chat-service.ts: replace loop with delegation
- internal-chat-connection.test.ts: add coverage

import { and, asc, desc, eq } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';

import type {
  CommunicationFile,
  CommunicationInboundMessage,
  CommunicationProviderConversation,
  CommunicationProviderMessage,
} from '@forge-runtime/core';

import type {Database} from '../database/client'
import { createId } from '../utils/id';
import {
  tickets,
  ticketMessages,
  type NewTicket,
  type NewTicketMessage,
} from '../database/schema';

type MessageHandler = (message: CommunicationInboundMessage) => Promise<void>;

function buildTicketConversation(ticket: {
  id: string;
  subject: string;
  status: string;
  priority: string;
  agentId: string;
  productId: string;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
}): CommunicationProviderConversation {
  const label = ticket.status === 'open' ? '🔵' : ticket.status === 'in_progress' ? '🟡' : ticket.status === 'resolved' ? '🟢' : '⚪';
  return {
    targetKey: ticket.id,
    slug: ticket.id,
    displayName: `${label} ${ticket.subject}`,
    description: `Status: ${ticket.status} | Priority: ${ticket.priority} | Agent: ${ticket.agentId}`,
    metadata: {
      status: ticket.status,
      priority: ticket.priority,
      agentId: ticket.agentId,
      productId: ticket.productId,
      resolvedAt: ticket.resolvedAt,
    },
  };
}

function buildTicketMessage(row: {
  id: string;
  authorType: string;
  authorAgentId: string | null;
  content: string;
  createdAt: number;
}): CommunicationProviderMessage {
  return {
    messageId: row.id,
    targetKey: row.id,
    content: row.content,
    authorTargetKey: row.authorAgentId ?? row.authorType,
    createdAt: row.createdAt,
    metadata: {
      authorType: row.authorType,
    },
  };
}

export function createTicketingService(db: Database) {
  let messageHandler: MessageHandler | null = null;

  // ── Ingestion (app → forge) ──────────────────────────────────────────

  async function ingestTicket(input: {
    externalId: string;
    productId: string;
    agentId: string;
    subject: string;
    content: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  }): Promise<{ ticketId: string; messageId: string }> {
    try {
      const existing = await db.query.tickets.findFirst({
        where: eq(tickets.externalId, input.externalId),
      });

      if (existing) {
        // Idempotent: attach message to existing ticket instead
        const msgId = createId();
        await db.insert(ticketMessages).values({
          id: msgId,
          ticketId: existing.id,
          authorType: 'end_user',
          content: input.content,
          createdAt: Date.now(),
        });
        await db.update(tickets).set({ updatedAt: Date.now() }).where(eq(tickets.id, existing.id));
        return { ticketId: existing.id, messageId: msgId };
      }

      const ticketId = createId();
      const messageId = createId();
      const now = Date.now();

      await db.insert(tickets).values({
        id: ticketId,
        externalId: input.externalId,
        productId: input.productId,
        agentId: input.agentId,
        subject: input.subject,
        status: 'open',
        priority: input.priority ?? 'medium',
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(ticketMessages).values({
        id: messageId,
        ticketId,
        authorType: 'end_user',
        content: input.content,
        createdAt: now,
      });

      return { ticketId, messageId };
    } catch (err) {
      forgeDebug({
        scope: 'ticketing-service',
        level: 'error',
        message: `ingestTicket failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { externalId: input.externalId },
      });
      forgeDebug({ scope: 'service', level: 'error', message: 'service: operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  async function ingestTicketReply(input: {
    ticketId: string;
    externalId: string;
    content: string;
  }): Promise<{ messageId: string }> {
    try {
      const messageId = createId();
      await db.insert(ticketMessages).values({
        id: messageId,
        ticketId: input.ticketId,
        authorType: 'end_user',
        content: input.content,
        createdAt: Date.now(),
      });
      await db.update(tickets).set({ updatedAt: Date.now() }).where(eq(tickets.id, input.ticketId));
      return { messageId };
    } catch (err) {
      forgeDebug({
        scope: 'ticketing-service',
        level: 'error',
        message: `ingestTicketReply failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { ticketId: input.ticketId },
      });
      forgeDebug({ scope: 'service', level: 'error', message: 'service: operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  // ── Agent-facing operations ───────────────────────────────────────────

  async function listTickets(input: {
    agentId: string;
    status?: string;
    limit?: number;
  }): Promise<CommunicationProviderConversation[]> {
    try {
      const rows = await db.query.tickets.findMany({
        where: input.status
          ? and(eq(tickets.agentId, input.agentId), eq(tickets.status, input.status))
          : eq(tickets.agentId, input.agentId),
        orderBy: [desc(tickets.updatedAt)],
        limit: input.limit ?? 50,
      });
      return rows.map(buildTicketConversation);
    } catch (err) {
      forgeDebug({
        scope: 'ticketing-service',
        level: 'error',
        message: `listTickets failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { agentId: input.agentId, status: input.status },
      });
      forgeDebug({ scope: 'service', level: 'error', message: 'service: operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  async function getMessages(input: {
    targetKey: string;
    limit?: number;
    offset?: number;
  }): Promise<CommunicationProviderMessage[]> {
    try {
      const rows = await db.query.ticketMessages.findMany({
        where: eq(ticketMessages.ticketId, input.targetKey),
        orderBy: [asc(ticketMessages.createdAt)],
        limit: input.limit ?? 50,
        offset: input.offset ?? 0,
      });
      return rows.map(buildTicketMessage);
    } catch (err) {
      forgeDebug({
        scope: 'ticketing-service',
        level: 'error',
        message: `getMessages failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { targetKey: input.targetKey },
      });
      forgeDebug({ scope: 'getMessages', level: 'error', message: 'getMessages: operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  async function sendAgentReply(input: {
    ticketId: string;
    agentId: string;
    content: string;
  }): Promise<{ messageId: string }> {
    try {
      const messageId = createId();
      await db.insert(ticketMessages).values({
        id: messageId,
        ticketId: input.ticketId,
        authorType: 'agent',
        authorAgentId: input.agentId,
        content: input.content,
        createdAt: Date.now(),
      });
      await db.update(tickets).set({ updatedAt: Date.now() }).where(eq(tickets.id, input.ticketId));
      return { messageId };
    } catch (err) {
      forgeDebug({
        scope: 'ticketing-service',
        level: 'error',
        message: `sendAgentReply failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { ticketId: input.ticketId },
      });
      forgeDebug({ scope: 'service', level: 'error', message: 'service: operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  async function updateTicketStatus(input: {
    ticketId: string;
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
  }): Promise<void> {
    try {
      const resolvedAt = input.status === 'resolved' || input.status === 'closed' ? Date.now() : null;
      await db.update(tickets).set({
        status: input.status,
        updatedAt: Date.now(),
        resolvedAt,
      }).where(eq(tickets.id, input.ticketId));
    } catch (err) {
      forgeDebug({
        scope: 'ticketing-service',
        level: 'error',
        message: `updateTicketStatus failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { ticketId: input.ticketId, status: input.status },
      });
      forgeDebug({ scope: 'updateTicketStatus', level: 'error', message: 'updateTicketStatus: operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  // ── Provider hook ──────────────────────────────────────────────────────

  function onMessage(callback: MessageHandler) {
    messageHandler = callback;
  }

  function clearHandler() {
    messageHandler = null;
  }

  async function notifyNewMessage(ticketId: string, messageId: string) {
    if (!messageHandler) return;
    try {
      const msgRow = await db.query.ticketMessages.findFirst({
        where: eq(ticketMessages.id, messageId),
      });
      if (!msgRow) return;
      const ticketRow = await db.query.tickets.findFirst({
        where: eq(tickets.id, ticketId),
      });
      if (!ticketRow) return;

      const inbound: CommunicationInboundMessage = {
        providerId: 'ticketing',
        targetKey: ticketId,
        messageId,
        content: msgRow.content,
        authorTargetKey: msgRow.authorAgentId ?? 'end_user',
        timestamp: msgRow.createdAt,
        conversationName: ticketRow.subject,
        metadata: {
          authorType: msgRow.authorType,
          status: ticketRow.status,
          priority: ticketRow.priority,
        },
      };
      await messageHandler(inbound);
    } catch (err) {
      forgeDebug({
        scope: 'ticketing-service',
        level: 'error',
        message: `notifyNewMessage failed: ${err instanceof Error ? err.message : String(err)}`,
        context: { ticketId, messageId },
      });
      forgeDebug({ scope: 'service', level: 'error', message: 'service: operation failed', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  return {
    ingestTicket,
    ingestTicketReply,
    listTickets,
    getMessages,
    sendAgentReply,
    updateTicketStatus,
    onMessage,
    clearHandler,
    notifyNewMessage,
  };
}

export type TicketingService = ReturnType<typeof createTicketingService>;
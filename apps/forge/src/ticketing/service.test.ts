import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTicketingService } from './service';

// Mock createId for deterministic IDs
vi.mock('../utils/id.js', () => ({
  createId: vi.fn((prefix = '') => `${prefix}${++mockCounter.value}`,
  ),
}));
const mockCounter = { value: 0 };

// ── In-memory DB mock matching drizzle query interface ──────────────────────

type TicketRow = {
  id: string; productId: string; agentId: string; subject: string;
  status: string; priority: string; externalId: string | null;
  createdAt: number; updatedAt: number; resolvedAt: number | null;
};
type MessageRow = {
  id: string; ticketId: string; authorType: string;
  authorAgentId: string | null; content: string; createdAt: number;
};

function matches(row: Record<string, unknown>, where: unknown): boolean {
  if (!where) return true;
  const w = where as { config?: { name?: string }; value?: unknown; queryChunks?: unknown[] };
  // eq() → { config: { name }, value }
  if (w.config?.name && w.value !== undefined) {
    return row[w.config.name] === w.value;
  }
  // and() → { queryChunks: [...] }
  if (w.queryChunks?.length) {
    return w.queryChunks.every((c) => matches(row, c));
  }
  return true;
}

function orderByDesc(rows: TicketRow[], col: keyof TicketRow): TicketRow[] {
  return [...rows].sort((a, b) => {
    const av = a[col] as number;
    const bv = b[col] as number;
    return av < bv ? 1 : av > bv ? -1 : 0;
  });
}

function orderByAsc(rows: MessageRow[], col: keyof MessageRow): MessageRow[] {
  return [...rows].sort((a, b) => {
    const av = a[col] as number;
    const bv = b[col] as number;
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
}

function makeDb() {
  const tickets: TicketRow[] = [];
  const messages: MessageRow[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = {};

  db.insert = vi.fn(() => ({
    values: (row: TicketRow | MessageRow) => {
      if ('ticketId' in row && 'authorType' in row) {
        messages.push(row as MessageRow);
      } else {
        tickets.push(row as TicketRow);
      }
    },
  }));

  db.update = vi.fn(() => ({
    set: vi.fn((set: Partial<TicketRow>) => ({
      where: vi.fn((where: unknown) => {
        tickets.forEach((t) => {
          if (matches(t as unknown as Record<string, unknown>, where)) {
            Object.assign(t, set);
          }
        });
      }),
    })),
  }));

  db.query = {
    tickets: {
      findFirst: vi.fn(({ where }: { where: unknown }) => {
        return tickets.find((t) => matches(t as unknown as Record<string, unknown>, where)) ?? null;
      }),
      findMany: vi.fn(({ where, orderBy, limit }: { where?: unknown; orderBy?: unknown; limit?: number }) => {
        let results = tickets.filter((t) => matches(t as unknown as Record<string, unknown>, where));
        if (orderBy) results = orderByDesc(results, 'updatedAt');
        if (limit) results = results.slice(0, limit);
        return results;
      }),
    },
    ticketMessages: {
      findMany: vi.fn(({ where, orderBy, limit, offset }: { where?: unknown; orderBy?: unknown; limit?: number; offset?: number }) => {
        let results = messages.filter((m) => matches(m as unknown as Record<string, unknown>, where));
        if (orderBy) results = orderByAsc(results, 'createdAt');
        if (offset) results = results.slice(offset);
        if (limit) results = results.slice(0, limit);
        return results;
      }),
      findFirst: vi.fn(({ where }: { where: unknown }) => {
        return messages.find((m) => matches(m as unknown as Record<string, unknown>, where)) ?? null;
      }),
    },
  };

  return db;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('TicketingService', () => {
  beforeEach(() => {
    mockCounter.value = 0;
  });

  describe('ingestTicket', () => {
    it('creates ticket and initial message with different IDs', async () => {
      const db = makeDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ticketing = createTicketingService(db as any);
      const result = await ticketing.ingestTicket({
        externalId: 'ext-123',
        productId: 'prod-1',
        agentId: 'agent-1',
        subject: 'Login broken',
        content: 'Cannot log in with Chrome',
        priority: 'high',
      });
      expect(result.ticketId).toBeTruthy();
      expect(result.messageId).toBeTruthy();
      expect(result.ticketId).not.toBe(result.messageId);
    });

    it('is idempotent for duplicate externalId — same ticket, new message', async () => {
      const db = makeDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ticketing = createTicketingService(db as any);
      const r1 = await ticketing.ingestTicket({
        externalId: 'ext-dup',
        productId: 'prod-1',
        agentId: 'agent-1',
        subject: 'First',
        content: 'First content',
        priority: 'medium',
      });
      const r2 = await ticketing.ingestTicket({
        externalId: 'ext-dup',
        productId: 'prod-1',
        agentId: 'agent-1',
        subject: 'Second',
        content: 'Second content',
        priority: 'low',
      });
      expect(r2.ticketId).toBe(r1.ticketId);
      expect(r2.messageId).not.toBe(r1.messageId);
    });

    it('creates ticket with default priority medium', async () => {
      const db = makeDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ticketing = createTicketingService(db as any);
      const result = await ticketing.ingestTicket({
        externalId: 'ext-no-priority',
        productId: 'prod-1',
        agentId: 'agent-1',
        subject: 'Test',
        content: 'Body',
      });
      expect(result.ticketId).toBeTruthy();
    });
  });

  describe('listTickets', () => {
    it('returns empty list when no tickets', async () => {
      const db = makeDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ticketing = createTicketingService(db as any);
      const result = await ticketing.listTickets({ agentId: 'agent-1' });
      expect(result).toEqual([]);
    });

    it('returns ticket with displayName containing subject and priority metadata', async () => {
      const db = makeDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ticketing = createTicketingService(db as any);
      await ticketing.ingestTicket({
        externalId: 'ext-list',
        productId: 'prod-1',
        agentId: 'agent-1',
        subject: 'My ticket',
        content: 'Body',
        priority: 'urgent',
      });
      const result = await ticketing.listTickets({ agentId: 'agent-1' });
      expect(result).toHaveLength(1);
      expect(result[0].displayName).toContain('My ticket');
      expect(result[0].metadata.priority).toBe('urgent');
    });

    it('shows open status with blue emoji', async () => {
      const db = makeDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ticketing = createTicketingService(db as any);
      await ticketing.ingestTicket({
        externalId: 'ext-open',
        productId: 'prod-1',
        agentId: 'agent-1',
        subject: 'Open ticket',
        content: 'Body',
      });
      const result = await ticketing.listTickets({ agentId: 'agent-1' });
      expect(result[0].displayName).toContain('\u{1F535}');
    });

    it('filters by status when provided', async () => {
      const db = makeDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ticketing = createTicketingService(db as any);
      await ticketing.ingestTicket({
        externalId: 'ext-filter',
        productId: 'prod-1',
        agentId: 'agent-1',
        subject: 'Filtered ticket',
        content: 'Body',
      });
      await ticketing.updateTicketStatus({ ticketId: '', status: 'resolved' });
      const result = await ticketing.listTickets({ agentId: 'agent-1', status: 'open' });
      expect(result).toHaveLength(1);
    });
  });

  describe('sendAgentReply', () => {
    it('adds agent message to ticket and second message has authorType agent', async () => {
      const db = makeDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ticketing = createTicketingService(db as any);
      const { ticketId } = await ticketing.ingestTicket({
        externalId: 'ext-reply',
        productId: 'prod-1',
        agentId: 'agent-1',
        subject: 'Reply test',
        content: 'User message',
      });
      const reply = await ticketing.sendAgentReply({
        ticketId,
        agentId: 'agent-1',
        content: 'Agent response',
      });
      expect(reply.messageId).toBeTruthy();
      const messages = await ticketing.getMessages({ targetKey: ticketId });
      expect(messages).toHaveLength(2);
      expect(messages[1].content).toBe('Agent response');
      expect(messages[1].metadata.authorType).toBe('agent');
    });
  });

  describe('updateTicketStatus', () => {
    it('changes status to resolved', async () => {
      const db = makeDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ticketing = createTicketingService(db as any);
      const { ticketId } = await ticketing.ingestTicket({
        externalId: 'ext-status',
        productId: 'prod-1',
        agentId: 'agent-1',
        subject: 'Status test',
        content: 'Body',
      });
      await ticketing.updateTicketStatus({ ticketId, status: 'resolved' });
      const tickets = await ticketing.listTickets({ agentId: 'agent-1' });
      expect(tickets[0].metadata.status).toBe('resolved');
    });

    it('sets resolvedAt timestamp when closed', async () => {
      const db = makeDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ticketing = createTicketingService(db as any);
      const { ticketId } = await ticketing.ingestTicket({
        externalId: 'ext-resolved-at',
        productId: 'prod-1',
        agentId: 'agent-1',
        subject: 'Resolved test',
        content: 'Body',
      });
      await ticketing.updateTicketStatus({ ticketId, status: 'closed' });
      const tickets = await ticketing.listTickets({ agentId: 'agent-1' });
      expect(tickets[0].metadata.resolvedAt).toBeTruthy();
    });
  });

  describe('ingestTicketReply', () => {
    it('appends message to existing ticket', async () => {
      const db = makeDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ticketing = createTicketingService(db as any);
      const { ticketId } = await ticketing.ingestTicket({
        externalId: 'ext-reply-ingest',
        productId: 'prod-1',
        agentId: 'agent-1',
        subject: 'Reply ingest test',
        content: 'Initial',
      });
      const reply = await ticketing.ingestTicketReply({
        ticketId,
        externalId: 'ext-reply-2',
        content: 'Follow up from user',
      });
      expect(reply.messageId).toBeTruthy();
      const messages = await ticketing.getMessages({ targetKey: ticketId });
      expect(messages).toHaveLength(2);
      expect(messages[1].content).toBe('Follow up from user');
      expect(messages[1].authorTargetKey).toBe('end_user');
    });
  });
});
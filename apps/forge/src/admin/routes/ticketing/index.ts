/**
 * Ticketing Admin Routes - #1034
 * Provider-based communication channel for support tickets.
 */

import type { HttpHandler } from '../../../http/server.js';
import { z } from 'zod';
import { jsonResponse, parseJsonBody } from '../helpers.js';
import type { Database } from '../../../database/index.js';
import { createTicketingService } from '../../../ticketing/service.js';

const ingestTicketSchema = z.object({
  externalId: z.string().min(1),
  productId: z.string().min(1),
  agentId: z.string().min(1),
  subject: z.string().min(1).max(200),
  content: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
}).strict();

const ingestReplySchema = z.object({
  externalId: z.string().min(1),
  ticketId: z.string().min(1),
  content: z.string().min(1),
}).strict();

const updateStatusSchema = z.object({
  ticketId: z.string().min(1),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
}).strict();

export function createTicketingRoutes(httpServer: HttpHandler, db: Database) {
  const ticketing = createTicketingService(db);

  // POST /admin/ticketing/ticket — ingest new ticket from app
  httpServer.post('/admin/ticketing/ticket', async (request) => {
    const body = parseJsonBody(request.bodyText, ingestTicketSchema);
    const result = await ticketing.ingestTicket({
      externalId: body.externalId,
      productId: body.productId,
      agentId: body.agentId,
      subject: body.subject,
      content: body.content,
      priority: body.priority,
    });
    return jsonResponse(result, 201);
  });

  // POST /admin/ticketing/reply — ingest reply to existing ticket
  httpServer.post('/admin/ticketing/reply', async (request) => {
    const body = parseJsonBody(request.bodyText, ingestReplySchema);
    const result = await ticketing.ingestTicketReply({
      ticketId: body.ticketId,
      externalId: body.externalId,
      content: body.content,
    });
    return jsonResponse(result, 201);
  });

  // PATCH /admin/ticketing/status — update ticket status
  httpServer.patch('/admin/ticketing/status', async (request) => {
    const body = parseJsonBody(request.bodyText, updateStatusSchema);
    await ticketing.updateTicketStatus({
      ticketId: body.ticketId,
      status: body.status,
    });
    return jsonResponse({ ok: true });
  });

  // GET /admin/ticketing/:agentId — list tickets for agent
  httpServer.get('/admin/ticketing/:agentId', async (request) => {
    const agentId = request.params?.agentId;
    if (!agentId) return jsonResponse({ error: 'agentId required' }, 400);
    const status = request.query?.status as string | undefined;
    const limit = request.query?.limit ? parseInt(request.query.limit as string, 10) : undefined;
    const result = await ticketing.listTickets({ agentId, status, limit });
    return jsonResponse(result);
  });

  // GET /admin/ticketing/:agentId/:ticketId — get messages for ticket
  httpServer.get('/admin/ticketing/:agentId/:ticketId', async (request) => {
    const { agentId, ticketId } = request.params ?? {};
    if (!agentId || !ticketId) return jsonResponse({ error: 'params required' }, 400);
    const limit = request.query?.limit ? parseInt(request.query.limit as string, 10) : undefined;
    const offset = request.query?.offset ? parseInt(request.query.offset as string, 10) : undefined;
    const result = await ticketing.getMessages({ targetKey: ticketId, limit, offset });
    return jsonResponse(result);
  });

  return { ticketing };
}

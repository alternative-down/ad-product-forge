/**
 * Agent Operations Routes - Phase 2 of #689
 * Routes for agent operations (wake, internal chat send) from routes.ts
 */

import { z } from 'zod';
import type { HttpHandler } from '../../../http/server';
import type { InternalAgentRegistry } from '../../../agents/internal-agent-registry';
import type { InternalChatService } from '../../../communication/internal-chat-service';
import { jsonResponse } from '../index';
import { adminRoutesParseJsonBody } from '../index';
import { agentActionSchema } from '../schemas/agents';
import { labeledRoute } from './admin-route-error-helper';
import { AgentOperationSendError } from './operations.errors';

/**
 * Schema for POST /admin/agent/internal-chat/send.
 * Different from adminInternalChatSendSchema (schemas.ts) — this one accepts
 * senderSlug/senderDisplayName because the sender account is created dynamically
 * from the admin panel rather than pre-registered.
 */
const adminInternalChatSendFromAdminSchema = z
  .object({
    agentId: z.string(),
    senderSlug: z.string(),
    senderDisplayName: z.string(),
    content: z.string(),
    targetKey: z.string().optional(),
  })
  .strict();

/**
 * Register routes for agent operations (wake, internal chat)
 *
 * The consumer uses the canonical `InternalChatService` and
 * `InternalAgentRegistry` types so that producer signatures propagate here
 * automatically — eliminating the recurring module-boundary type drift
 * cycles (#6499, #6497, #6494, #6498, #6496, #6500). See #6519.
 */
export function registerAgentOperationRoutes(
  httpServer: {
    registerRoute: (route: {
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      path: string;
      handler: HttpHandler;
    }) => void;
  },
  input: { internalChat: InternalChatService },
  registry: InternalAgentRegistry,
) {
  // POST /admin/agent/wake
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/wake',
    handler: labeledRoute('Agent wake route', (request) => {
      const { agentId } = adminRoutesParseJsonBody(request.bodyText, agentActionSchema);
      const entry = registry.get(agentId);
      const timestamp = Date.now();

      if (!entry) {
        return jsonResponse({ error: `Loaded agent not found: ${agentId}` }, 404);
      }

      if (!entry.runner) {
        return jsonResponse(
          { error: `Agent has no runner attached (wake ignored): ${agentId}` },
          409,
        );
      }

      entry.runner.notifyExternalEvent({
        type: 'manual-wake',
        groupKey: `manual-wake:${agentId}`,
        groupMetadata: {
          Source: 'admin-console',
          AgentId: agentId,
        },
        idempotencyKey: `manual-wake:${agentId}:${timestamp}`,
        text: 'Manual wake requested from admin console.',
        timestamp,
      });
      return jsonResponse({ success: true });

    }),
  });

  // POST /admin/agent/internal-chat/send
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/internal-chat/send',
    handler: labeledRoute('Internal chat send route', async (request) => {
      const payload = adminRoutesParseJsonBody(request.bodyText, adminInternalChatSendFromAdminSchema);
      const sender = await input.internalChat.registerExternalAccount({
        slug: payload.senderSlug,
        displayName: payload.senderDisplayName,
      });
      const sent = await input.internalChat.sendMessage({
        accountId: sender.accountId,
        targetKey: payload.targetKey ?? payload.agentId,
        content: payload.content,
        attachments: [],
      });
      if (sent.valid === false) {
        throw new AgentOperationSendError(sent.error);
      }

      return jsonResponse({
        success: true,
        conversationKey: sent.data.conversationKey,
        messageId: sent.data.messageId,
      });

    }),
  });
}

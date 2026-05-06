/**
 * Agent Operations Routes - Phase 2 of #689
 * Routes for agent operations (wake, internal chat send) from routes.ts
 */

import { z } from 'zod';
import type { CommunicationFile } from '@forge-runtime/core';
import type { HttpHandler } from '../../../http/server';
import { jsonResponse } from '../index';
import { parseJsonBody } from '../index';
import { agentActionSchema } from '../schemas';

/**
 * Schema for POST /admin/agent/internal-chat/send.
 * Different from adminInternalChatSendSchema (schemas.ts) — this one accepts
 * senderSlug/senderDisplayName because the sender account is created dynamically
 * from the admin panel rather than pre-registered.
 */
const adminInternalChatSendFromAdminSchema = z.object({
  agentId: z.string(),
  senderSlug: z.string(),
  senderDisplayName: z.string(),
  content: z.string(),
  targetKey: z.string().optional(),
}).strict();

interface InternalChat {
  registerExternalAccount: (input: { slug: string; displayName: string }) => Promise<{ accountId: string }>;
  sendMessage: (input: { accountId: string; targetKey: string; content: string; attachments: CommunicationFile[] }) => Promise<{ success: boolean;
    conversationKey: string;
    messageId: string;
  }>;
}

interface RegistryEntry {
  runner: {
    notifyExternalEvent: (event: unknown) => void;
    forceIdle: () => Promise<void>;
  };
}

interface Registry {
  get(agentId: string): RegistryEntry | null;
}

/**
 * Register routes for agent operations (wake, internal chat)
 */
export function registerAgentOperationRoutes(
  httpServer: { registerRoute: (route: { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; handler: HttpHandler }) => void },
  input: {
    internalChat: InternalChat;
  },
  registry: Registry
) {
  // POST /admin/agent/wake
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/wake',
    handler: async (request) => {
      const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
      const entry = registry.get(agentId);
      const timestamp = Date.now();

      if (!entry) {
        return jsonResponse({ error: `Loaded agent not found: ${agentId}` }, 404);
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
    },
  });

  // POST /admin/agent/internal-chat/send
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/internal-chat/send',
    handler: async (request) => {
      const payload = parseJsonBody(request.bodyText, adminInternalChatSendFromAdminSchema);
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

      return jsonResponse({
        success: true,
        conversationKey: sent.conversationKey,
        messageId: sent.messageId,
      });
    },
  });
}
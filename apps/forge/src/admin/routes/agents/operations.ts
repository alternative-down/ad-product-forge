/**
 * Agent Operations Routes - Phase 2 of #689
 * Routes for agent operations (wake, internal chat send) from routes.ts
 */

import { z } from 'zod';
import type { CommunicationFile } from '@forge-runtime/core';
import type { HttpHandler } from '../../../http/server';
import { jsonResponse } from '../index';
import { parseJsonBody } from '../index';
import { agentActionSchema } from '../schemas/agents';
import { adminRouteError } from './admin-route-error-helper';

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

// Widen to accept any object with the required methods (including the full InternalChat from routes.ts)
type InternalChat = {
  registerExternalAccount: (input: {
    slug: string;
    displayName: string;
  }) => Promise<{ accountId: string }>;
  sendMessage: (input: {
    accountId: string;
    targetKey: string;
    content: string;
    attachments: CommunicationFile[];
  }) => Promise<{ success: boolean; conversationKey: string; messageId: string }>;
};

// Widen to accept both the minimal Registry and the full InternalAgentRegistry
type RegistryEntry =
  | {
      runner: {
        notifyExternalEvent: (event: unknown) => void;
        forceIdle: () => Promise<void>;
      };
    }
  | {
      loadAll: (db: unknown, config: unknown) => Promise<unknown[]>;
      add: (db: unknown, runtime: unknown, config?: unknown) => Promise<unknown>;
      remove: (agentId: string) => void;
      get: (agentId: string) => unknown;
      list: () => unknown[];
    }
  | null;

type Registry =
  | {
      get(agentId: string): RegistryEntry;
    }
  | {
      loadAll: (db: unknown, config: unknown) => Promise<unknown[]>;
      add: (db: unknown, runtime: unknown, config?: unknown) => Promise<unknown>;
      remove: (agentId: string) => void;
      get: (agentId: string) => unknown;
      list: () => unknown[];
    };

/**
 * Register routes for agent operations (wake, internal chat)
 */
export function registerAgentOperationRoutes(
  httpServer: {
    registerRoute: (route: {
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      path: string;
      handler: HttpHandler;
    }) => void;
  },
  input: { internalChat: InternalChat } | any,
  registry: Registry | any,
) {
  // POST /admin/agent/wake
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/wake',
    handler: (request) => {
      try {
        const { agentId } = parseJsonBody(request.bodyText, agentActionSchema);
        const entry = registry.get(agentId);
        const timestamp = Date.now();

        if (entry === null || entry === undefined) {
          return jsonResponse({ error: `Loaded agent not found: ${agentId}` }, 404);
        }

        (entry as { runner: { notifyExternalEvent: (event: unknown) => void; forceIdle: () => Promise<void> } }).runner.notifyExternalEvent({
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
      } catch (err) {
        return adminRouteError(err, { label: 'Agent wake route' });
      }
    },
  });

  // POST /admin/agent/internal-chat/send
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/agent/internal-chat/send',
    handler: async (request) => {
      try {
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
      } catch (err) {
        return adminRouteError(err, { label: 'Internal chat send route' });
      }
    },
  });
}

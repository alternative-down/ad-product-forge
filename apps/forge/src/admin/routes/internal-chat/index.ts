/**
 * Internal Chat Admin Routes - Phase 2 of #689
 * Routes for internal chat management extracted from routes.ts
 */

import type { HttpHandler } from '../../../http/server';
import { z } from 'zod';
import type { InternalChatService } from '../../../communication/internal-chat-service';
import { createInternalChatConversationSchema } from '../schemas/internal-chat';
import { jsonResponse, parseJsonBody } from '../index';
import { createInternalChatSseHandler } from './events';
import { registerAccountRoutes } from './internal-chat-account-routes';
import { registerConversationRoutes } from './internal-chat-conversation-routes';
import { registerGroupMemberRoutes } from './internal-chat-group-member-routes';
import { forgeDebug } from '../debug';

interface Request {
  query: Map<string, string>;
  bodyText: string;
}

/**
 * Register routes for internal chat management
 */
export function registerInternalChatRoutes(
  httpServer: { registerRoute: (route: { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; handler: HttpHandler }) => void },
  internalChat: InternalChatService
) {
  // GET /admin/internal-chat/events — SSE stream of incoming messages
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/internal-chat/events',
    handler: createInternalChatSseHandler(internalChat),
  });

  // GET /admin/internal-chat/accounts, /contacts
  // POST /admin/internal-chat/account/create, /update, /delete
  registerAccountRoutes(httpServer, internalChat);

  // GET /admin/internal-chat/conversations, /messages, /message-attachment
  // POST /admin/internal-chat/conversation/create, /send, /update, /archive
  registerConversationRoutes(httpServer, internalChat);

  // GET /admin/internal-chat/group-members
  // POST /admin/internal-chat/group-member/add, /update-role, /remove
  registerGroupMemberRoutes(httpServer, internalChat);
}

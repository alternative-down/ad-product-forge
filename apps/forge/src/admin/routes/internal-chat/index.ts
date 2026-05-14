/**
 * Internal Chat Admin Routes - Phase 2 of #689
 * Routes for internal chat management extracted from routes.ts
 */

import type { HttpHandler } from '../../../http/server';
import { z } from 'zod';
import type { InternalChatService } from '../../../communication/internal-chat-service';
import {
  createInternalChatConversationSchema,
  sendInternalChatConversationMessageSchema,
  updateInternalChatConversationSchema,
  archiveInternalChatConversationSchema,
  addInternalChatGroupMemberSchema,
  updateInternalChatGroupMemberRoleSchema,
  removeInternalChatGroupMemberSchema,
} from '../schemas';
import { jsonResponse, parseJsonBody } from '../index';
import { createInternalChatSseHandler } from './events';
import { registerAccountRoutes } from './internal-chat-account-routes';
import { registerConversationRoutes } from './internal-chat-conversation-routes';
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
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/internal-chat/group-members',
    handler: async (request: Request) => {
      try {
        const accountId = request.query.get('accountId');
        const conversationId = request.query.get('conversationId');

        if (!accountId || !conversationId) {
          return jsonResponse({ error: 'accountId and conversationId required' }, 400);
        }

        return jsonResponse(
          await internalChat.listGroupMembersByAccount({
            accountId,
            groupId: conversationId,
          }),
        );
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/internal-chat/group-members', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },  });

  // POST /admin/internal-chat/group-member/add
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/group-member/add',
    handler: async (request: Request) => {
      try {
        const accountId = request.query.get('accountId');
        if (!accountId) {
          return jsonResponse({ error: 'accountId required' }, 400);
        }
        const body = parseJsonBody(request.bodyText, addInternalChatGroupMemberSchema);
        return jsonResponse(
          await internalChat.addMemberToGroupByAccount({
            accountId,
            groupId: body.conversationId,
            participantAccountId: body.participantKey,
            role: body.role,
          }),
        );
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/internal-chat/group-member/add', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },  });

  // POST /admin/internal-chat/group-member/update-role
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/group-member/update-role',
    handler: async (request: Request) => {
      try {
        const accountId = request.query.get('accountId');
        if (!accountId) {
          return jsonResponse({ error: 'accountId required' }, 400);
        }
        const body = parseJsonBody(request.bodyText, updateInternalChatGroupMemberRoleSchema);
        return jsonResponse(
          await internalChat.updateMemberRoleByAccount({
            accountId,
            groupId: body.conversationId,
            participantAccountId: body.participantKey,
            role: body.role,
          }),
        );
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/internal-chat/group-member/update-role', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },  });

  // POST /admin/internal-chat/group-member/remove
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/group-member/remove',
    handler: async (request: Request) => {
      try {
        const accountId = request.query.get('accountId');
        if (!accountId) {
          return jsonResponse({ error: 'accountId required' }, 400);
        }
        const body = parseJsonBody(request.bodyText, removeInternalChatGroupMemberSchema);
        return jsonResponse(
          await internalChat.removeMemberFromGroupByAccount({
            accountId,
            groupId: body.conversationId,
            participantAccountId: body.participantKey,
          }),
        );
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/internal-chat/group-member/remove', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },  });
}

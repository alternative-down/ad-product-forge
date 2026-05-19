/**
 * Internal Chat Group Member Routes — Phase 4 of #2744
 * Extracted from internal-chat/index.ts (group-member routes).
 */

import type { HttpHandler, HttpResponse } from '../../../http/server';
import type { InternalChatService } from '../../../communication/internal-chat-service';
import type { InternalChatHttpServer } from './index';
import {
  addInternalChatGroupMemberSchema,
  updateInternalChatGroupMemberRoleSchema,
  removeInternalChatGroupMemberSchema,
} from '../schemas/internal-chat';
import { jsonResponse, parseJsonBody } from '../index';
import { withRouteErrorHandler } from './internal-chat-route-helpers';

// ─── Route handlers ──────────────────────────────────────────────────────────

function buildListGroupMembersHandler(
  internalChat: InternalChatService,
): HttpHandler {
  return (withRouteErrorHandler as any)('admin', '/admin/internal-chat/group-members', async (request: any) => {
    const accountId = request.query.get('accountId');
    const conversationId = request.query.get('conversationId');

    if (accountId === null || accountId === undefined || conversationId === null || conversationId === undefined) {
      return jsonResponse({ error: 'accountId and conversationId required' }, 400);
    }

    return jsonResponse(
      await internalChat.listGroupMembersByAccount({
        accountId,
        groupId: conversationId,
      }),
    );
  });
}

function buildAddMemberHandler(
  internalChat: InternalChatService,
): HttpHandler {
  return (withRouteErrorHandler as any)('admin', '/admin/internal-chat/group-member/add', async (request: any) => {
    const accountId = request.query.get('accountId');
    if (accountId === null || accountId === undefined) {
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
  });
}

function buildUpdateRoleHandler(
  internalChat: InternalChatService,
): HttpHandler {
  return (withRouteErrorHandler as any)('admin', '/admin/internal-chat/group-member/update-role', async (request: any) => {
    const accountId = request.query.get('accountId');
    if (accountId === null || accountId === undefined) {
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
  });
}

function buildRemoveMemberHandler(
  internalChat: InternalChatService,
): HttpHandler {
  return (withRouteErrorHandler as any)('admin', '/admin/internal-chat/group-member/remove', async (request: any) => {
    const accountId = request.query.get('accountId');
    if (accountId === null || accountId === undefined) {
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
  });
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerGroupMemberRoutes(
  httpServer: InternalChatHttpServer,
  internalChat: InternalChatService,
): void {
  httpServer.registerRoute({ method: 'GET', path: '/admin/internal-chat/group-members', handler: buildListGroupMembersHandler(internalChat) });
  httpServer.registerRoute({ method: 'POST', path: '/admin/internal-chat/group-member/add', handler: buildAddMemberHandler(internalChat) });
  httpServer.registerRoute({ method: 'POST', path: '/admin/internal-chat/group-member/update-role', handler: buildUpdateRoleHandler(internalChat) });
  httpServer.registerRoute({ method: 'POST', path: '/admin/internal-chat/group-member/remove', handler: buildRemoveMemberHandler(internalChat) });
}

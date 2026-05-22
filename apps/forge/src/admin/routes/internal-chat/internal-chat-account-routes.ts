/**
 * Internal Chat Account Routes — Phase 2 of #2744
 * Extracted from internal-chat/index.ts (account management routes).
 */

import type { HttpHandler, HttpRequest } from '../../../http/server';
import type { InternalChatService } from '../../../communication/internal-chat-service';
import type { InternalChatHttpServer } from './index';
import {
  createExternalInternalChatAccountSchema,
  updateExternalInternalChatAccountSchema,
  deleteExternalInternalChatAccountSchema,
} from '../schemas/internal-chat';
import { jsonResponse, parseJsonBody } from '../index';
import { withRouteErrorHandler } from './internal-chat-route-helpers';

// ─── Account route handlers ──────────────────────────────────────────────────

function buildListAccountsHandler(
  internalChat: InternalChatService,
): () => ReturnType<HttpHandler> {
  return withRouteErrorHandler('admin', '/admin/internal-chat/accounts', async () => {
    const accounts = await internalChat.listAccounts();
    return jsonResponse(
      accounts
        .filter((account: object) => (account as { agentId: unknown }).agentId === null)
        .map((account: object) => ({
          accountId: (account as { id: string }).id,
          slug: (account as { slug: string }).slug,
          displayName: (account as { displayName: string }).displayName,
          description: (account as { description: string | undefined }).description ?? '',
        })),
    );
  });
}

function buildListContactsHandler(
  internalChat: InternalChatService,
): () => ReturnType<HttpHandler> {
  return withRouteErrorHandler('admin', '/admin/internal-chat/contacts', async () => {
    const accounts = await internalChat.listAccounts();
    return jsonResponse(
      accounts.map((account: object) => ({
        accountId: (account as { id: string }).id,
        agentId: (account as { agentId: string | null }).agentId,
        slug: (account as { slug: string }).slug,
        displayName: (account as { displayName: string }).displayName,
        description: (account as { description: string | undefined }).description ?? '',
        isAgent: Boolean((account as { agentId: unknown }).agentId),
      })),
    );
  });
}

function buildCreateAccountHandler(internalChat: InternalChatService): HttpHandler {
  return withRouteErrorHandler('admin', '/admin/internal-chat/account/create', async (request: HttpRequest) => {
    const body = parseJsonBody(request.bodyText, createExternalInternalChatAccountSchema);
    return jsonResponse(
      await internalChat.registerExternalAccount({
        slug: body.targetKey,
        displayName: body.name ?? body.targetKey,
      }),
    );
  });
}

function buildUpdateAccountHandler(internalChat: InternalChatService): HttpHandler {
  return withRouteErrorHandler('admin', '/admin/internal-chat/account/update', async (request: HttpRequest) => {
    const body = parseJsonBody(request.bodyText, updateExternalInternalChatAccountSchema);
    return jsonResponse(
      await internalChat.updateExternalAccount({
        accountId: body.accountId,
        displayName: body.name,
      }),
    );
  });
}

function buildDeleteAccountHandler(internalChat: InternalChatService): HttpHandler {
  return withRouteErrorHandler('admin', '/admin/internal-chat/account/delete', async (request: HttpRequest) => {
    const body = parseJsonBody(request.bodyText, deleteExternalInternalChatAccountSchema);
    return jsonResponse(await internalChat.deleteExternalAccount(body));
  });
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerAccountRoutes(
  httpServer: InternalChatHttpServer,
  internalChat: InternalChatService,
): void {
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/internal-chat/accounts',
    handler: buildListAccountsHandler(internalChat),
  });
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/internal-chat/contacts',
    handler: buildListContactsHandler(internalChat),
  });
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/account/create',
    handler: buildCreateAccountHandler(internalChat),
  });
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/account/update',
    handler: buildUpdateAccountHandler(internalChat),
  });
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/account/delete',
    handler: buildDeleteAccountHandler(internalChat),
  });
}

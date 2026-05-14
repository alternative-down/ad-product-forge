/**
 * Internal Chat Account Routes — Phase 2 of #2744
 * Extracted from internal-chat/index.ts (account management routes).
 */

import type { HttpHandler } from '../../../http/server';
import type { InternalChatService } from '../../../communication/internal-chat-service';
import {
  createExternalInternalChatAccountSchema,
  updateExternalInternalChatAccountSchema,
  deleteExternalInternalChatAccountSchema,
} from '../schemas/internal-chat';
import { jsonResponse, parseJsonBody } from '../index';
import { withRouteErrorHandler, getQueryParam } from './internal-chat-route-helpers';

// ─── Account route handlers ──────────────────────────────────────────────────

function buildListAccountsHandler(internalChat: InternalChatService): () => ReturnType<HttpHandler> {
  return withRouteErrorHandler('admin', '/admin/internal-chat/accounts', async () => {
    const accounts = await internalChat.listAccounts();
    return jsonResponse(
      accounts
        .filter((account) => account.agentId === null)
        .map((account) => ({
          accountId: account.id,
          slug: account.slug,
          displayName: account.displayName,
          description: account.description ?? '',
        })),
    );
  });
}

function buildListContactsHandler(internalChat: InternalChatService): () => ReturnType<HttpHandler> {
  return withRouteErrorHandler('admin', '/admin/internal-chat/contacts', async () => {
    const accounts = await internalChat.listAccounts();
    return jsonResponse(
      accounts.map((account) => ({
        accountId: account.id,
        agentId: account.agentId,
        slug: account.slug,
        displayName: account.displayName,
        description: account.description ?? '',
        isAgent: Boolean(account.agentId),
      })),
    );
  });
}

function buildCreateAccountHandler(internalChat: InternalChatService): (request: { query: Map<string, string>; bodyText: string }) => ReturnType<HttpHandler> {
  return withRouteErrorHandler('admin', '/admin/internal-chat/account/create', async (request) => {
    const body = parseJsonBody(request.bodyText, createExternalInternalChatAccountSchema);
    return jsonResponse(
      await internalChat.registerExternalAccount({
        slug: body.targetKey,
        displayName: body.name ?? body.targetKey,
      }),
    );
  });
}

function buildUpdateAccountHandler(internalChat: InternalChatService): (request: { query: Map<string, string>; bodyText: string }) => ReturnType<HttpHandler> {
  return withRouteErrorHandler('admin', '/admin/internal-chat/account/update', async (request) => {
    const body = parseJsonBody(request.bodyText, updateExternalInternalChatAccountSchema);
    return jsonResponse(
      await internalChat.updateExternalAccount({
        accountId: body.accountId,
        displayName: body.name,
        webhookUrl: body.webhookUrl,
      }),
    );
  });
}

function buildDeleteAccountHandler(internalChat: InternalChatService): (request: { query: Map<string, string>; bodyText: string }) => ReturnType<HttpHandler> {
  return withRouteErrorHandler('admin', '/admin/internal-chat/account/delete', async (request) => {
    const body = parseJsonBody(request.bodyText, deleteExternalInternalChatAccountSchema);
    return jsonResponse(await internalChat.deleteExternalAccount(body));
  });
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerAccountRoutes(
  httpServer: { registerRoute: (route: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string; handler: HttpHandler }) => void },
  internalChat: InternalChatService,
): void {
  httpServer.registerRoute({ method: 'GET', path: '/admin/internal-chat/accounts', handler: buildListAccountsHandler(internalChat) });
  httpServer.registerRoute({ method: 'GET', path: '/admin/internal-chat/contacts', handler: buildListContactsHandler(internalChat) });
  httpServer.registerRoute({ method: 'POST', path: '/admin/internal-chat/account/create', handler: buildCreateAccountHandler(internalChat) });
  httpServer.registerRoute({ method: 'POST', path: '/admin/internal-chat/account/update', handler: buildUpdateAccountHandler(internalChat) });
  httpServer.registerRoute({ method: 'POST', path: '/admin/internal-chat/account/delete', handler: buildDeleteAccountHandler(internalChat) });
}

/**
 * Internal Chat Admin Routes — #2744 Phase 5
 * Pure wiring layer: SSE + route module registration.
 * All route logic extracted to focused modules:
 *   events.ts, account-routes.ts, conversation-routes.ts, group-member-routes.ts
 */

import type { InternalChatService } from '../../../communication/internal-chat-service';
import { createInternalChatSseHandler } from './events';
import { registerAccountRoutes } from './internal-chat-account-routes';
import { registerConversationRoutes } from './internal-chat-conversation-routes';
import { registerGroupMemberRoutes } from './internal-chat-group-member-routes';

import type { ForgeHttpServer } from '../../../http/server';

/** Type alias so callers can pass ForgeHttpServer directly. */
export type InternalChatHttpServer = Pick<ForgeHttpServer, 'registerRoute'>;

export function registerInternalChatRoutes(
  httpServer: InternalChatHttpServer,
  internalChat: InternalChatService,
): void {
  // SSE stream of incoming messages
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/internal-chat/events',
    handler: createInternalChatSseHandler(internalChat),
  });

  // Account routes: list accounts, get contacts
  registerAccountRoutes(httpServer as any, internalChat);

  // Conversation routes: list conversations, messages, attachments; create/send/update/archive
  registerConversationRoutes(httpServer as any, internalChat);

  // Group-member routes: list members, add, update role, remove
  registerGroupMemberRoutes(httpServer as any, internalChat);
}

/**
 * Internal Chat Admin Routes — #2744 Phase 5
 * Pure wiring layer: SSE + route module registration.
 * All route logic extracted to focused modules:
 *   events.ts, account-routes.ts, conversation-routes.ts, group-member-routes.ts
 */

import type { HttpHandler } from '../../../http/server';
import type { InternalChatService } from '../../../communication/internal-chat-service';
import { createInternalChatSseHandler } from './events';
import { registerAccountRoutes } from './internal-chat-account-routes';
import { registerConversationRoutes } from './internal-chat-conversation-routes';
import { registerGroupMemberRoutes } from './internal-chat-group-member-routes';

/** Re-export helpers and schemas for consumers of this module. */
export { jsonResponse, parseJsonBody } from '../index';

export function registerInternalChatRoutes(
  httpServer: { registerRoute: (route: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string; handler: HttpHandler }) => void },
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

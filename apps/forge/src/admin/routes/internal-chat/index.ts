/**
 * Internal Chat Admin Routes - Phase 2 of #689
 * Routes for internal chat management extracted from routes.ts
 */

import type { HttpHandler } from '../../../http/server';
import { z } from 'zod';
import type { InternalChatService } from '../../../communication/internal-chat-service';
import {
  createExternalInternalChatAccountSchema,
  updateExternalInternalChatAccountSchema,
  deleteExternalInternalChatAccountSchema,
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

  // GET /admin/internal-chat/accounts
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/internal-chat/accounts',
    handler: async () => {
      try {
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
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/internal-chat/accounts', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },  });

  // GET /admin/internal-chat/contacts
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/internal-chat/contacts',
    handler: async () => {
      try {
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
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/internal-chat/contacts', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },  });

  // POST /admin/internal-chat/account/create
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/account/create',
    handler: async (request: Request) => {
      try {
        const body = parseJsonBody(request.bodyText, createExternalInternalChatAccountSchema);
        return jsonResponse(
          await internalChat.registerExternalAccount({
            slug: body.targetKey,
            displayName: body.name ?? body.targetKey,
          }),
        );
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/internal-chat/account/create', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },  });

  // POST /admin/internal-chat/account/update
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/account/update',
    handler: async (request: Request) => {
      try {
        const body = parseJsonBody(request.bodyText, updateExternalInternalChatAccountSchema);
        return jsonResponse(
          await internalChat.updateExternalAccount({
            accountId: body.accountId,
            displayName: body.name,
            webhookUrl: body.webhookUrl,
          }),
        );
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/internal-chat/account/update', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },  });

  // POST /admin/internal-chat/account/delete
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/account/delete',
    handler: async (request: Request) => {
      try {
        const body = parseJsonBody(request.bodyText, deleteExternalInternalChatAccountSchema);
        return jsonResponse(await internalChat.deleteExternalAccount(body));
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/internal-chat/account/delete', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },  });

  // GET /admin/internal-chat/conversations
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/internal-chat/conversations',
    handler: async (request: Request) => {
      try {
        const accountId = request.query.get('accountId');
        if (!accountId) {
          return jsonResponse({ error: 'accountId required' }, 400);
        }
        const items = await internalChat.listConversationsByAccount({
          accountId,
          limit: 100,
        });

        return jsonResponse(
          items.map((conversation) => ({
            conversationId: conversation.targetKey,
            conversationKey: conversation.targetKey,
            provider: 'internal-chat',
            type: (conversation.participants ?? []).length > 1 ? 'group' : 'dm',
            name: conversation.name ?? conversation.targetKey,
            participants: conversation.participants ?? [],
            updatedAt: Date.parse(conversation.latestMessageAt),
            messages: conversation.messages.map((message) => ({
              messageId: message.messageId,
              content: message.content,
              unread: message.unread,
              authorDisplayName: message.authorDisplayName,
              createdAt: Date.parse(message.createdAt),
            })),
          })),
        );
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/internal-chat/conversations', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },  });

  // GET /admin/internal-chat/messages
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/internal-chat/messages',
    handler: async (request: Request) => {
      try {
        const accountId = request.query.get('accountId');
        const conversationId = request.query.get('conversationId');
        const limit = request.query.get('limit');
        const offset = request.query.get('offset');

        if (!accountId || !conversationId) {
          return jsonResponse({ error: 'accountId and conversationId required' }, 400);
        }

        const items = await internalChat.getMessagesByAccount({
          accountId,
          conversationKey: conversationId,
          limit: limit ? parseInt(limit, 10) : undefined,
          offset: offset ? parseInt(offset, 10) : undefined,
        });

        return jsonResponse({
          items: items.map((message) => ({
            messageId: message.messageId,
            authorAccountId: message.authorId,
            authorDisplayName: message.authorDisplayName,
            content: message.content,
            createdAt: Date.parse(message.createdAt),
            attachments: message.attachments?.map((attachment) => ({
              name: attachment.name,
              contentType: attachment.contentType,
              sizeBytes: attachment.sizeBytes,
            })) ?? [],
          })),
          hasMore: items.length === (limit ? parseInt(limit, 10) : 20),
        });
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/internal-chat/messages', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },  });

  // GET /admin/internal-chat/message-attachment
  httpServer.registerRoute({
    method: 'GET',
    path: '/admin/internal-chat/message-attachment',
    handler: async (request: Request) => {
      try {
        const accountId = request.query.get('accountId');
        const conversationId = request.query.get('conversationId');
        const messageId = request.query.get('messageId');
        const attachmentName = request.query.get('attachmentName');

        if (!accountId || !conversationId || !messageId || !attachmentName) {
          return jsonResponse({ error: 'Missing required query params' }, 400);
        }

        const attachment = await internalChat.getMessageAttachmentByAccount({
          accountId,
          conversationId,
          messageId,
          attachmentName,
        });

        return {
          status: 200,
          headers: {
            'content-type': attachment.contentType ?? 'application/octet-stream',
            'content-disposition': `inline; filename="${encodeURIComponent(attachment.name)}"`,
            'cache-control': 'no-store',
          },
          body: Buffer.from(attachment.data),
        };
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/internal-chat/message-attachment', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },  });

  // POST /admin/internal-chat/conversation/create
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/conversation/create',
    handler: async (request: Request) => {
      try {
        const body = parseJsonBody(request.bodyText, createInternalChatConversationSchema);

        if (body.type === 'dm') {
          const conversation = await internalChat.ensureDirectConversationByAccount({
            accountId: body.accountId,
            participantAccountId: body.memberKeys[0] as string,
          });

          return jsonResponse({
            conversationId: conversation.conversationId,
            conversationKey: conversation.conversationKey,
          });
        }

        const conversationKey = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const result = await internalChat.createExternalChatGroupWithMembers({
          accountId: body.accountId,
          conversationKey,
          name: body.name?.trim() || 'Novo grupo',
          memberAccountIds: body.memberKeys as string[],
        });

        return jsonResponse({
          conversationId: result.groupId,
          conversationKey: result.conversationKey,
        });
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/internal-chat/conversation/create', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },  });

  // POST /admin/internal-chat/conversation/send
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/conversation/send',
    handler: async (request: Request) => {
      try {
        const body = parseJsonBody(request.bodyText, sendInternalChatConversationMessageSchema);
        return jsonResponse(
          await internalChat.sendMessage({
            accountId: body.accountId,
            targetKey: body.conversationId,
            content: body.content,
            attachments: (body.attachments ?? []).map((attachment) => ({
              name: attachment.name,
              contentType: attachment.contentType,
              data: Uint8Array.from(Buffer.from(attachment.dataBase64, 'base64')),
            })),
          }),
        );
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/internal-chat/conversation/send', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },  });

  // POST /admin/internal-chat/conversation/update
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/conversation/update',
    handler: async (request: Request) => {
      try {
        const body = parseJsonBody(request.bodyText, updateInternalChatConversationSchema);
        return jsonResponse(
          await internalChat.updateGroupByAccount({
            groupId: body.conversationId,
            name: body.name,
          }),
        );
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/internal-chat/conversation/update', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },  });

  // POST /admin/internal-chat/conversation/archive
  httpServer.registerRoute({
    method: 'POST',
    path: '/admin/internal-chat/conversation/archive',
    handler: async (request: Request) => {
      try {
        const body = parseJsonBody(request.bodyText, archiveInternalChatConversationSchema);
        return jsonResponse(await internalChat.archiveConversationByAccount(body));
      } catch (err) {
        forgeDebug({ scope: 'admin', level: 'error', message: 'Admin route failed: /admin/internal-chat/conversation/archive', context: { error: err instanceof Error ? err.message : String(err) } });
        return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    },  });

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

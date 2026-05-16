/**
 * Internal Chat Conversation Routes — Phase 3 of #2744
 * Extracted from internal-chat/index.ts (conversation & message routes).
 */

import type { HttpHandler, HttpResponse } from '../../../http/server';
import type { InternalChatConversation } from '../../../database/schema';
import type { InternalChatService } from '../../../communication/internal-chat-service';
import {
  createInternalChatConversationSchema,
  sendInternalChatConversationMessageSchema,
  updateInternalChatConversationSchema,
  archiveInternalChatConversationSchema,
} from '../schemas/internal-chat';
import { jsonResponse, parseJsonBody } from '../index';
import { withRouteErrorHandler, getQueryParam, requireQueryParam } from './internal-chat-route-helpers';

// ─── Route handlers ──────────────────────────────────────────────────────────

function buildListConversationsHandler(
  internalChat: InternalChatService,
): (request: { query: Map<string, string>; bodyText: string }) => ReturnType<HttpHandler> {
  return withRouteErrorHandler('admin', '/admin/internal-chat/conversations', async (request) => {
    const accountIdOrResponse = requireQueryParam(request, 'accountId');
    if (typeof accountIdOrResponse !== 'string') return accountIdOrResponse;
    const accountId = accountIdOrResponse;
    const items = await internalChat.listConversationsByAccount({ accountId, limit: 100 });
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
  });
}

function buildListMessagesHandler(
  internalChat: InternalChatService,
): (request: { query: Map<string, string>; bodyText: string }) => ReturnType<HttpHandler> {
  return withRouteErrorHandler('admin', '/admin/internal-chat/messages', async (request) => {
    const accountIdOrResponse = requireQueryParam(request, 'accountId');
    if (typeof accountIdOrResponse !== 'string') return accountIdOrResponse;
    const accountId = accountIdOrResponse;
    const conversationIdOrResponse = requireQueryParam(request, 'conversationId');
    if (typeof conversationIdOrResponse !== 'string') return conversationIdOrResponse;
    const conversationId = conversationIdOrResponse;
    const _limit = getQueryParam(request, 'limit');
    const _offset = getQueryParam(request, 'offset');
    const limit = _limit ? parseInt(_limit, 10) : 20;
    const offset = _offset ? parseInt(_offset, 10) : 0;
    const items = await internalChat.getMessagesByAccount({
      accountId,
      conversationKey: conversationId,
      limit,
      offset,
    });
    return jsonResponse({
      items: items.map((message) => ({
        messageId: message.messageId,
        authorAccountId: message.authorId,
        authorDisplayName: message.authorDisplayName,
        content: message.content,
        createdAt: Date.parse(message.createdAt),
        attachments: message.attachments?.map((attachment) => ({
          name: (attachment as { name: string }).name,
          contentType: (attachment as { contentType: string }).contentType,
          sizeBytes: (attachment as { sizeBytes: number }).sizeBytes,
        })) ?? [],
      })),
      hasMore: items.length === limit,
    });
  });
}

function buildGetAttachmentHandler(
  internalChat: InternalChatService,
): (request: { query: Map<string, string>; bodyText: string }) => ReturnType<HttpHandler> {
  return withRouteErrorHandler('admin', '/admin/internal-chat/message-attachment', async (request) => {
    const accountIdOrResponse = requireQueryParam(request, 'accountId');
    if (typeof accountIdOrResponse !== 'string') return accountIdOrResponse;
    const accountId = accountIdOrResponse;
    const conversationIdOrResponse = requireQueryParam(request, 'conversationId');
    if (typeof conversationIdOrResponse !== 'string') return conversationIdOrResponse;
    const conversationId = conversationIdOrResponse;
    const messageIdOrResponse = requireQueryParam(request, 'messageId');
    if (typeof messageIdOrResponse !== 'string') return messageIdOrResponse;
    const messageId = messageIdOrResponse;
    const attachmentNameOrResponse = requireQueryParam(request, 'attachmentName');
    if (typeof attachmentNameOrResponse !== 'string') return attachmentNameOrResponse;
    const attachmentName = attachmentNameOrResponse;
    const attachment = await internalChat.getMessageAttachmentByAccount({
      accountId,
      conversationId,
      messageId,
      attachmentName,
    });
    if (!attachment) return { status: 404 };
    const safeAttachment = attachment as unknown as { name: string; contentType: string; data: string };
    return {
      status: 200,
      headers: {
        'content-type': safeAttachment.contentType ?? 'application/octet-stream',
        'content-disposition': `inline; filename="${encodeURIComponent(safeAttachment.name)}"`,
        'cache-control': 'no-store',
      },
      body: Buffer.from(safeAttachment.data),
    };
  });
}

function buildCreateConversationHandler(
  internalChat: InternalChatService,
): (request: { query: Map<string, string>; bodyText: string }) => ReturnType<HttpHandler> {
  return withRouteErrorHandler('admin', '/admin/internal-chat/conversation/create', async (request) => {
    const body = parseJsonBody(request.bodyText, createInternalChatConversationSchema);
    if (false) { // removed — updateInternalChatConversationSchema has no type field
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
  });
}

function buildSendMessageHandler(
  internalChat: InternalChatService,
): (request: { query: Map<string, string>; bodyText: string }) => ReturnType<HttpHandler> {
  return withRouteErrorHandler('admin', '/admin/internal-chat/conversation/send', async (request) => {
    const body = parseJsonBody(request.bodyText, sendInternalChatConversationMessageSchema);
    return jsonResponse(
      await internalChat.sendMessage({
        accountId: body.accountId,
        targetKey: body.conversationId,
        content: body.content,
        attachments: (body.attachments ?? []).map((attachment: { name: string; contentType: string; dataBase64: string }) => ({
          name: attachment.name,
          contentType: attachment.contentType,
          data: Uint8Array.from(Buffer.from(attachment.dataBase64, 'base64')),
        })),
      }),
    );
  });
}

function buildUpdateConversationHandler(
  internalChat: InternalChatService,
): (request: { query: Map<string, string>; bodyText: string }) => ReturnType<HttpHandler> {
  return withRouteErrorHandler('admin', '/admin/internal-chat/conversation/update', async (request) => {
    const body = parseJsonBody(request.bodyText, updateInternalChatConversationSchema);
    return jsonResponse(
      await internalChat.updateGroupByAccount({ groupId: body.conversationId, name: body.name } as Parameters<typeof internalChat.updateGroupByAccount>[0]),
    );
  });
}

function buildArchiveConversationHandler(
  internalChat: InternalChatService,
): (request: { query: Map<string, string>; bodyText: string }) => ReturnType<HttpHandler> {
  return withRouteErrorHandler('admin', '/admin/internal-chat/conversation/archive', async (request) => {
    const body = parseJsonBody(request.bodyText, archiveInternalChatConversationSchema);
    return jsonResponse(await internalChat.archiveConversationByAccount({
      accountId: body.accountId,
      conversationId: body.conversationId,
      getRequiredConversationForAccount: async () => ({ targetKey: body.conversationId } as unknown as InternalChatConversation),
    }));
  });
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerConversationRoutes(
  httpServer: { registerRoute: (route: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string; handler: (request: { query: Map<string, string>; bodyText: string }) => HttpResponse | Promise<HttpResponse> }) => void },
  internalChat: InternalChatService,
): void {
  httpServer.registerRoute({ method: 'GET', path: '/admin/internal-chat/conversations', handler: buildListConversationsHandler(internalChat) });
  httpServer.registerRoute({ method: 'GET', path: '/admin/internal-chat/messages', handler: buildListMessagesHandler(internalChat) });
  httpServer.registerRoute({ method: 'GET', path: '/admin/internal-chat/message-attachment', handler: buildGetAttachmentHandler(internalChat) });
  httpServer.registerRoute({ method: 'POST', path: '/admin/internal-chat/conversation/create', handler: buildCreateConversationHandler(internalChat) });
  httpServer.registerRoute({ method: 'POST', path: '/admin/internal-chat/conversation/send', handler: buildSendMessageHandler(internalChat) });
  httpServer.registerRoute({ method: 'POST', path: '/admin/internal-chat/conversation/update', handler: buildUpdateConversationHandler(internalChat) });
  httpServer.registerRoute({ method: 'POST', path: '/admin/internal-chat/conversation/archive', handler: buildArchiveConversationHandler(internalChat) });
}

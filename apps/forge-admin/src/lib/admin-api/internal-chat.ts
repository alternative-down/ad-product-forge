import { request, requestBlob } from './core';
import type {
  HomeInternalChatConversation,
  HomeInternalChatConversationMessagesResponse,
  HomeInternalChatGroupMember,
  InternalChatContact,
  InternalChatExternalAccount,
} from './types';

export function getInternalChatAccounts() {
  return request<InternalChatExternalAccount[]>('/admin/internal-chat/accounts');
}

export function getInternalChatContacts() {
  return request<InternalChatContact[]>('/admin/internal-chat/contacts');
}

export function createInternalChatAccount(input: {
  slug: string;
  displayName: string;
  description?: string;
}) {
  return request<{
    accountId: string;
    slug: string;
    displayName: string;
    description?: string;
  }>('/admin/internal-chat/account/create', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateInternalChatAccount(input: {
  accountId: string;
  slug: string;
  displayName: string;
  description?: string;
}) {
  return request<{
    accountId: string;
    slug: string;
    displayName: string;
    description?: string;
  }>('/admin/internal-chat/account/update', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteInternalChatAccount(accountId: string) {
  return request<{ accountId: string; deleted: true }>('/admin/internal-chat/account/delete', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  });
}

export function getHomeInternalChatConversations(accountId: string) {
  return request<HomeInternalChatConversation[]>(
    `/admin/internal-chat/conversations?accountId=${encodeURIComponent(accountId)}`,
  );
}

export function getHomeInternalChatMessages(
  accountId: string,
  conversationId: string,
  limit: number,
  offset: number,
) {
  return request<HomeInternalChatConversationMessagesResponse>(
    `/admin/internal-chat/messages?accountId=${encodeURIComponent(accountId)}&conversationId=${encodeURIComponent(conversationId)}&limit=${limit}&offset=${offset}`,
  );
}

export function getHomeInternalChatAttachmentBlob(input: {
  accountId: string;
  conversationId: string;
  messageId: string;
  attachmentName: string;
}) {
  return requestBlob(
    `/admin/internal-chat/message-attachment?accountId=${encodeURIComponent(input.accountId)}&conversationId=${encodeURIComponent(input.conversationId)}&messageId=${encodeURIComponent(input.messageId)}&attachmentName=${encodeURIComponent(input.attachmentName)}`,
  );
}

export function createHomeInternalChatConversation(input: {
  accountId: string;
  type: 'dm' | 'group';
  name?: string;
  participantAccountIds: string[];
}) {
  return request<{ conversationId: string; conversationKey: string }>('/admin/internal-chat/conversation/create', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateHomeInternalChatConversation(input: {
  accountId: string;
  conversationId: string;
  name: string;
}) {
  return request<{ id: string; name: string }>('/admin/internal-chat/conversation/update', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function sendHomeInternalChatMessage(input: {
  accountId: string;
  conversationId: string;
  content: string;
  attachments?: Array<{
    name: string;
    contentType?: string;
    dataBase64: string;
  }>;
}) {
  return request<{ success: true; messageId: string; conversationKey: string }>(
    '/admin/internal-chat/conversation/send',
    {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        attachments: input.attachments ?? [],
      }),
    },
  );
}

export function archiveHomeInternalChatConversation(input: {
  accountId: string;
  conversationId: string;
}) {
  return request<{ conversationId: string; archived: true }>('/admin/internal-chat/conversation/archive', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getHomeInternalChatGroupMembers(accountId: string, conversationId: string) {
  return request<HomeInternalChatGroupMember[]>(
    `/admin/internal-chat/group-members?accountId=${encodeURIComponent(accountId)}&conversationId=${encodeURIComponent(conversationId)}`,
  );
}

export function addHomeInternalChatGroupMember(input: {
  accountId: string;
  conversationId: string;
  participantAccountId: string;
  role?: 'admin' | 'normal';
}) {
  return request<HomeInternalChatGroupMember[]>('/admin/internal-chat/group-member/add', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateHomeInternalChatGroupMemberRole(input: {
  accountId: string;
  conversationId: string;
  participantAccountId: string;
  role: 'admin' | 'normal';
}) {
  return request<HomeInternalChatGroupMember[]>('/admin/internal-chat/group-member/update-role', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function removeHomeInternalChatGroupMember(input: {
  accountId: string;
  conversationId: string;
  participantAccountId: string;
}) {
  return request<HomeInternalChatGroupMember[]>('/admin/internal-chat/group-member/remove', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * Creates an EventSource connection to the SSE events endpoint for real-time
 * internal chat message delivery.
 *
 * @param accountId       - The admin account id (required).
 * @param conversationId   - Optional. When set, only events for this conversation are received.
 * @param onMessage        - Called with the parsed InternalChatDeliveryMessage when the server sends a message event.
 * @returns                An open EventSource. Caller is responsible for calling .close() on unmount.
 */
export function createInternalChatEventSource(
  accountId: string,
  conversationId: string | null,
  onMessage: (message: InternalChatSseMessage) => void,
) {
  const url = `/admin/internal-chat/events?accountId=${encodeURIComponent(accountId)}${
    conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : ''
  }`;
  const es = new EventSource(url);
  es.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data) as InternalChatSseMessage);
    } catch {
      // Malformed JSON — ignore.
    }
  };
  return es;
}

/** Shape of a message delivered via the SSE events endpoint. */
export interface InternalChatSseMessage {
  targetKey: string;
  messageId: string;
  conversationName?: string;
  authorId: string;
  authorDisplayName: string;
  authorUsername: string;
  content: string;
  attachments: Array<{
    name: string;
    contentType?: string;
    sizeBytes?: number;
    dataBase64?: string;
  }>;
  createdAt: string;
  metadata: {
    conversationType: 'dm' | 'group';
    groupMembers?: Array<{
      participantId: string;
      agentId?: string | null;
      slug: string;
      displayName: string;
    }>;
  };
}

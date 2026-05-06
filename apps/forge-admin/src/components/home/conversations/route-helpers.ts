import type { InternalChatExternalAccount, HomeInternalChatConversation } from '@/lib/admin-api/index';

import type { AccountForm, ConversationForm, LocalConversation } from './context';

export const SELECTED_ACCOUNT_STORAGE_KEY = 'forja.home.internal-chat.selected-account-id';

export function createEmptyAccountForm(): AccountForm {
  return {
    accountId: undefined,
    slug: '',
    displayName: '',
    description: '',
    slugDirty: false,
  };
}

export function createConversationForm(): ConversationForm {
  return {
    type: 'dm',
    name: '',
    participantQuery: '',
    selectedParticipantIds: [],
  };
}

export function createAccountForm(account: InternalChatExternalAccount): AccountForm {
  return {
    accountId: account.accountId,
    slug: account.slug,
    displayName: account.displayName,
    description: account.description,
    slugDirty: true,
  };
}

export function normalizeAccount(account: {
  accountId: string;
  slug: string;
  displayName: string;
  description?: string;
}): InternalChatExternalAccount {
  return {
    accountId: account.accountId,
    slug: account.slug,
    displayName: account.displayName,
    description: account.description ?? '',
  };
}

export function normalizeConversations(conversations: HomeInternalChatConversation[]): LocalConversation[] {
  return conversations.map((conversation) => ({
    id: conversation.conversationId,
    type: conversation.type,
    name: conversation.name,
    participants: conversation.participants,
    updatedAt: conversation.updatedAt,
    messages: conversation.messages.map((message) => ({
      id: message.messageId,
      authorDisplayName: message.authorDisplayName,
      content: message.content,
      createdAt: message.createdAt,
      attachments: [],
    })),
  }));
}

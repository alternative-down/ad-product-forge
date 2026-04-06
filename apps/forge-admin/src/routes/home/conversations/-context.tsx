import { createContext, useContext } from 'react';

import type { InternalChatContact, InternalChatExternalAccount } from '@/lib/admin-api';

export type LocalConversationMessage = {
  id: string;
  authorDisplayName: string;
  content: string;
  createdAt: number;
  attachments: Array<{
    id: string;
    name: string;
    sizeBytes: number;
  }>;
};

export type LocalConversation = {
  id: string;
  type: 'dm' | 'group';
  name: string;
  participants: string[];
  updatedAt: number;
  messages: LocalConversationMessage[];
};

export type AccountForm = {
  accountId?: string;
  slug: string;
  displayName: string;
  description: string;
  slugDirty: boolean;
};

export type ConversationForm = {
  type: 'dm' | 'group';
  name: string;
  participantQuery: string;
  selectedParticipantIds: string[];
};

export type AccountDialogMode = 'create' | 'edit';

export type HomeConversationsContextValue = {
  accounts: InternalChatExternalAccount[];
  contacts: InternalChatContact[];
  selectedAccountId: string;
  setSelectedAccountId: (value: string) => void;
  selectedAccount: InternalChatExternalAccount | null;
  conversations: LocalConversation[];
  setConversations: React.Dispatch<React.SetStateAction<LocalConversation[]>>;
  reloadConversations: () => Promise<void>;
};

const HomeConversationsContext = createContext<HomeConversationsContextValue | null>(null);

export function HomeConversationsProvider({
  value,
  children,
}: {
  value: HomeConversationsContextValue;
  children: React.ReactNode;
}) {
  return (
    <HomeConversationsContext.Provider value={value}>
      {children}
    </HomeConversationsContext.Provider>
  );
}

export function useHomeConversations() {
  const value = useContext(HomeConversationsContext);

  if (!value) {
    throw new Error('Home conversations context not available.');
  }

  return value;
}

export function createLocalId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '??';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function formatRecentMessageTime(value: number) {
  const diffMs = Date.now() - value;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays >= 3) {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
    }).format(value);
  }

  if (diffMs < 60 * 1000) {
    return 'agora';
  }

  if (diffMs < 60 * 60 * 1000) {
    return `${Math.max(1, Math.floor(diffMs / (60 * 1000)))} min`;
  }

  if (diffMs < 24 * 60 * 60 * 1000) {
    return `${Math.floor(diffMs / (60 * 60 * 1000))} h`;
  }

  return `${Math.floor(diffDays)} d`;
}

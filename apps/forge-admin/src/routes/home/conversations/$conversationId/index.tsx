import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  addHomeInternalChatGroupMember,
  archiveHomeInternalChatConversation,
  getHomeInternalChatGroupMembers,
  getHomeInternalChatMessages,
  removeHomeInternalChatGroupMember,
  sendHomeInternalChatMessage,
  updateHomeInternalChatConversation,
  updateHomeInternalChatGroupMemberRole,
  type HomeInternalChatConversationMessage,
} from '@/lib/admin-api';
import { formatRecentMessageTime, useHomeConversations } from '../-context';
import { ConversationComposer } from '@/components/home/conversations/ConversationComposer';
import { ConversationHeader } from '@/components/home/conversations/ConversationHeader';
import { ConversationMessagesPane } from '@/components/home/conversations/ConversationMessagesPane';
import { ParticipantsDialog } from './-participants-dialog';
import { RenameConversationDialog } from './-rename-conversation-dialog';

export const Route = createFileRoute('/home/conversations/$conversationId/')({
  component: HomeConversationDetailIndexRoute,
});

function encodeArrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function HomeConversationDetailIndexRoute() {
  const navigate = useNavigate();
  const { conversationId } = Route.useParams();
  const { contacts, conversations, selectedAccount, reloadConversations } = useHomeConversations();
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const initialScrollDoneRef = useRef(false);
  const activeConversationKeyRef = useRef('');
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [participantsDialogOpen, setParticipantsDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [availableParticipantId, setAvailableParticipantId] = useState('');
  const [availableParticipantRole, setAvailableParticipantRole] = useState<'admin' | 'normal'>('normal');
  const [messageDraft, setMessageDraft] = useState('');
  const [attachmentDrafts, setAttachmentDrafts] = useState<File[]>([]);
  const [messages, setMessages] = useState<HomeInternalChatConversationMessage[]>([]);
  const [members, setMembers] = useState<HomeInternalChatGroupMember[]>([]);
  const selectedConversation = conversations.find((conversation) => conversation.id === decodeURIComponent(conversationId)) ?? null;
  const selectedAccountId = selectedAccount?.accountId ?? '';
  const selectedConversationId = selectedConversation?.id ?? '';
  const selectedConversationType = selectedConversation?.type ?? 'dm';
  const selectedConversationName = selectedConversation?.name ?? '';
  const contactByAccountId = useMemo(
    () => new Map(contacts.map((contact) => [contact.accountId, contact])),
    [contacts],
  );
  const availableParticipants = useMemo(() => {
    const memberIds = new Set(members.map((member) => member.participantId));

    return contacts.filter((contact) => !memberIds.has(contact.accountId));
  }, [contacts, members]);

  useEffect(() => {
    activeConversationKeyRef.current = selectedAccountId && selectedConversationId
      ? `${selectedAccountId}:${selectedConversationId}`
      : '';
  }, [selectedAccountId, selectedConversationId]);

  useEffect(() => {
    if (!selectedAccountId || !selectedConversationId) {
      return;
    }

    let cancelled = false;
    const conversationKey = `${selectedAccountId}:${selectedConversationId}`;

    async function loadConversationState() {
      const [messageResult, memberResult] = await Promise.all([
        getHomeInternalChatMessages(selectedAccountId, selectedConversationId, 100, 0),
        selectedConversationType === 'group'
          ? getHomeInternalChatGroupMembers(selectedAccountId, selectedConversationId)
          : Promise.resolve([]),
      ]);

      if (!cancelled && activeConversationKeyRef.current === conversationKey) {
        setMessages(messageResult.items);
        setMembers(memberResult);
        setGroupNameDraft(selectedConversationName);
        setAutoScrollEnabled(true);
      }
    }

    void loadConversationState();

    return () => {
      cancelled = true;
    };
  }, [
    selectedAccountId,
    selectedConversationId,
    selectedConversationName,
    selectedConversationType,
  ]);

  useEffect(() => {
    initialScrollDoneRef.current = false;
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedAccountId || !selectedConversationId) {
      return;
    }

    let cancelled = false;
    const conversationKey = `${selectedAccountId}:${selectedConversationId}`;

    const interval = window.setInterval(() => {
      void (async () => {
        const messageResult = await getHomeInternalChatMessages(
          selectedAccountId,
          selectedConversationId,
          100,
          0,
        );

        if (cancelled || activeConversationKeyRef.current !== conversationKey) {
          return;
        }

        setMessages(messageResult.items);

        if (autoScrollEnabled) {
          requestAnimationFrame(() => {
            const nextViewport = scrollAreaRef.current?.querySelector('[data-slot=scroll-area-viewport]');

            if (nextViewport instanceof HTMLDivElement) {
              nextViewport.scrollTop = nextViewport.scrollHeight;
            }
          });
        }
      })();
    }, 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [autoScrollEnabled, selectedAccountId, selectedConversationId]);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-slot=scroll-area-viewport]');

    if (!(viewport instanceof HTMLDivElement)) {
      return;
    }

    function handleScroll() {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      setAutoScrollEnabled(distanceFromBottom <= 8);
    }

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [selectedConversationId, messages.length]);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-slot=scroll-area-viewport]');

    if (!(viewport instanceof HTMLDivElement) || initialScrollDoneRef.current || messages.length === 0) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
    initialScrollDoneRef.current = true;
  }, [messages]);

  if (!selectedConversation) {
    return <div className="text-sm text-muted-foreground">Conversa não encontrada.</div>;
  }

  const canManageGroup = selectedConversation.type === 'group' && members.length > 0;

  return (
    <>
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
        <ConversationHeader
          conversation={selectedConversation}
          canManageGroup={canManageGroup}
          onBack={() => void navigate({ to: '/home/conversations' })}
          onRenameOpen={() => setRenameDialogOpen(true)}
          onParticipantsOpen={() => setParticipantsDialogOpen(true)}
          onArchive={() => {
            if (!selectedAccount) {
              return;
            }

            void (async () => {
              await archiveHomeInternalChatConversation({
                accountId: selectedAccount.accountId,
                conversationId: selectedConversation.id,
              });
              await reloadConversations();
              await navigate({ to: '/home/conversations' });
            })();
          }}
        />

        <ConversationMessagesPane
          containerRef={scrollAreaRef}
          accountId={selectedAccount?.accountId ?? ''}
          conversationId={selectedConversation.id}
          messages={messages}
          contactByAccountId={contactByAccountId}
          formatRecentMessageTime={formatRecentMessageTime}
          autoScrollEnabled={autoScrollEnabled}
          onScrollToBottom={() => {
            const viewport = scrollAreaRef.current?.querySelector('[data-slot=scroll-area-viewport]');

            if (!(viewport instanceof HTMLDivElement)) {
              return;
            }

            viewport.scrollTop = viewport.scrollHeight;
            setAutoScrollEnabled(true);
          }}
        />

        <ConversationComposer
          messageDraft={messageDraft}
          attachmentDrafts={attachmentDrafts}
          disabled={!selectedAccount || (!messageDraft.trim() && attachmentDrafts.length === 0)}
          onMessageDraftChange={setMessageDraft}
          onAttachmentDraftsChange={setAttachmentDrafts}
          onSend={() => {
            if (!selectedAccount || (!messageDraft.trim() && attachmentDrafts.length === 0)) {
              return;
            }

            void (async () => {
              const attachments = await Promise.all(
                attachmentDrafts.map(async (file) => ({
                  name: file.name,
                  contentType: file.type || undefined,
                  dataBase64: encodeArrayBufferToBase64(await file.arrayBuffer()),
                })),
              );

              await sendHomeInternalChatMessage({
                accountId: selectedAccount.accountId,
                conversationId: selectedConversation.id,
                content: messageDraft.trim(),
                attachments,
              });

              const messageResult = await getHomeInternalChatMessages(
                selectedAccount.accountId,
                selectedConversation.id,
                100,
                0,
              );

              setMessages(messageResult.items);
              setMessageDraft('');
              setAttachmentDrafts([]);
              setAutoScrollEnabled(true);
              requestAnimationFrame(() => {
                const viewport = scrollAreaRef.current?.querySelector('[data-slot=scroll-area-viewport]');

                if (viewport instanceof HTMLDivElement) {
                  viewport.scrollTop = viewport.scrollHeight;
                }
              });
              await reloadConversations();
            })();
          }}
        />
      </div>

      <RenameConversationDialog
        open={renameDialogOpen}
        groupNameDraft={groupNameDraft}
        onOpenChange={setRenameDialogOpen}
        onGroupNameDraftChange={setGroupNameDraft}
        onSubmit={() => {
          if (!selectedAccount || !groupNameDraft.trim()) {
            return;
          }

          void (async () => {
            await updateHomeInternalChatConversation({
              accountId: selectedAccount.accountId,
              conversationId: selectedConversation.id,
              name: groupNameDraft.trim(),
            });
            await reloadConversations();
            setRenameDialogOpen(false);
          })();
        }}
      />

      {selectedConversation.type === 'group' ? (
        <ParticipantsDialog
          open={participantsDialogOpen}
          members={members}
          availableParticipantId={availableParticipantId}
          availableParticipantRole={availableParticipantRole}
          availableParticipants={availableParticipants}
          onOpenChange={setParticipantsDialogOpen}
          onAvailableParticipantIdChange={setAvailableParticipantId}
          onAvailableParticipantRoleChange={setAvailableParticipantRole}
          onAddParticipant={() => {
            if (!selectedAccount || !availableParticipantId) {
              return;
            }

            void (async () => {
              const nextMembers = await addHomeInternalChatGroupMember({
                accountId: selectedAccount.accountId,
                conversationId: selectedConversation.id,
                participantAccountId: availableParticipantId,
                role: availableParticipantRole,
              });

              setMembers(nextMembers);
              setAvailableParticipantId('');
              setAvailableParticipantRole('normal');
              await reloadConversations();
            })();
          }}
          onRoleToggle={(participantId, nextIsAdmin) => {
            if (!selectedAccount) {
              return;
            }

            void (async () => {
              const nextMembers = await updateHomeInternalChatGroupMemberRole({
                accountId: selectedAccount.accountId,
                conversationId: selectedConversation.id,
                participantAccountId: participantId,
                role: nextIsAdmin ? 'admin' : 'normal',
              });

              setMembers(nextMembers);
            })();
          }}
          onRemoveParticipant={(participantId) => {
            if (!selectedAccount) {
              return;
            }

            void (async () => {
              const nextMembers = await removeHomeInternalChatGroupMember({
                accountId: selectedAccount.accountId,
                conversationId: selectedConversation.id,
                participantAccountId: participantId,
              });

              setMembers(nextMembers);
              await reloadConversations();
            })();
          }}
        />
      ) : null}
    </>
  );
}

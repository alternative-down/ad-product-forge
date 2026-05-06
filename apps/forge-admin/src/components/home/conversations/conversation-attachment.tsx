import { useEffect, useState } from 'react';

import { AdminDialogBody, AdminDialogContent, AdminDialogHeader, AdminDialogTitle } from '@/components/admin';
import { Dialog } from '@/components/ui/dialog';
import { getHomeInternalChatAttachmentBlob } from '@/lib/admin-api/index';

export function conversation-attachment(input: {
  accountId: string;
  conversationId: string;
  messageId: string;
  attachment: {
    name: string;
    contentType?: string;
    sizeBytes?: number;
  };
}) {
  const [imageUrl, setImageUrl] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!input.accountId || !isImageAttachment(input.attachment.contentType)) {
      return;
    }

    let revoked = false;
    let currentUrl = '';

    void (async () => {
      const blob = await getHomeInternalChatAttachmentBlob({
        accountId: input.accountId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        attachmentName: input.attachment.name,
      });

      currentUrl = URL.createObjectURL(blob);

      if (!revoked) {
        setImageUrl(currentUrl);
      }
    })();

    return () => {
      revoked = true;

      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [input.accountId, input.attachment.contentType, input.attachment.name, input.conversationId, input.messageId]);

  if (isImageAttachment(input.attachment.contentType) && imageUrl) {
    return (
      <>
        <button type="button" className="overflow-hidden rounded-sm border border-border" onClick={() => setPreviewOpen(true)}>
          <img src={imageUrl} alt={input.attachment.name} className="h-20 w-20 object-cover" />
        </button>

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <AdminDialogContent>
            <AdminDialogHeader>
              <AdminDialogTitle>{input.attachment.name}</AdminDialogTitle>
            </AdminDialogHeader>
            <AdminDialogBody>
              <img src={imageUrl} alt={input.attachment.name} className="max-h-[70dvh] w-full rounded-sm object-contain" />
            </AdminDialogBody>
          </AdminDialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <button
      type="button"
      className="rounded-sm border border-border px-3 py-2 text-xs text-muted-foreground"
      onClick={() => {
        if (!input.accountId) {
          return;
        }

        void (async () => {
          const blob = await getHomeInternalChatAttachmentBlob({
            accountId: input.accountId,
            conversationId: input.conversationId,
            messageId: input.messageId,
            attachmentName: input.attachment.name,
          });
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank', 'noopener,noreferrer');
          window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        })();
      }}
    >
      {input.attachment.name}
    </button>
  );
}

function isImageAttachment(contentType?: string) {
  return Boolean(contentType?.startsWith('image/'));
}

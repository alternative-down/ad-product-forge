import { SendHorizontal } from 'lucide-react';

import { AdminButton, AdminTextarea } from '@/components/admin';

export function conversation-composer(input: {
  messageDraft: string;
  attachmentDrafts: File[];
  disabled: boolean;
  onMessageDraftChange(value: string): void;
  onAttachmentDraftsChange(files: File[]): void;
  onSend(): void;
}) {
  return (
    <section className="space-y-3 border-t border-border pt-4">
      <AdminTextarea
        id="home-conversations-message"
        rows={4}
        value={input.messageDraft}
        onChange={(event) => input.onMessageDraftChange(event.target.value)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="text-sm text-muted-foreground">
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(event) => input.onAttachmentDraftsChange(Array.from(event.target.files ?? []))}
          />
          <span className="cursor-pointer">Adicionar anexos</span>
        </label>
        <AdminButton size="icon-sm" disabled={input.disabled} onClick={input.onSend}>
          <SendHorizontal className="h-4 w-4" />
          <span className="sr-only">Enviar</span>
        </AdminButton>
      </div>

      {input.attachmentDrafts.length > 0 ? (
        <div className="text-xs text-muted-foreground">
          {input.attachmentDrafts.map((file) => file.name).join(', ')}
        </div>
      ) : null}
    </section>
  );
}

import { createFileRoute } from '@tanstack/react-router';

import { ScrollArea } from '@/components/ui/scroll-area';

export const Route = createFileRoute('/home/conversations/')({
  component: HomeConversationsIndexRoute,
});

function HomeConversationsIndexRoute() {
  return (
    <div className="min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex h-[calc(100dvh-12rem)] min-h-0 flex-col md:grid md:grid-cols-[260px_minmax(0,1fr)] md:gap-6">
        <div className="min-h-0">
          <ScrollArea className="-mr-2 h-full [&_[data-slot=scroll-area-scrollbar]]:border-l-0">
            <div className="space-y-1 pr-3">
              <div className="rounded-sm border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                Nenhuma conversa disponível.
              </div>
            </div>
          </ScrollArea>
        </div>

        <div className="hidden min-h-0 md:block">
          <div className="flex h-full min-h-0 items-center justify-center text-sm text-muted-foreground">
            Selecione uma conversa.
          </div>
        </div>
      </div>
    </div>
  );
}

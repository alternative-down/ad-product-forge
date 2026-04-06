import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/home/conversations/')({
  component: HomeConversationsIndexRoute,
});

function HomeConversationsIndexRoute() {
  return (
    <div className="hidden h-full items-center justify-center text-sm text-muted-foreground md:flex">
      Selecione uma conversa.
    </div>
  );
}

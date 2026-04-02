import { createFileRoute } from '@tanstack/react-router';

import { PageHeader, SectionBlock } from '@/components/admin';

export const Route = createFileRoute('/home/')({
  component: HomeIndexRoute,
});

function HomeIndexRoute() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader title="Home" />
      <SectionBlock quiet>
        <div className="text-sm text-muted-foreground">Home</div>
      </SectionBlock>
    </div>
  );
}

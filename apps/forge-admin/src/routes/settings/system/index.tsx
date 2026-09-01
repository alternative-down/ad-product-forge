import { createFileRoute } from '@tanstack/react-router';

import { PageHeader } from '@/components/admin/layout/page-header';
import { FactoryResetSection } from '@/components/admin/system/factory-reset-section';

export const Route = createFileRoute('/settings/system/')({
  component: SettingsSystemRoute,
});

function SettingsSystemRoute() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sistema"
        description="Operações avançadas do sistema. Ações aqui são irreversíveis."
      />

      <FactoryResetSection />
    </div>
  );
}

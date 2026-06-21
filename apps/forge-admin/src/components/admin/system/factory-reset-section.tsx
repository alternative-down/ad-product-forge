import { useState } from 'react';

import { AdminButton } from '@/components/admin/forms/admin-button';

import { FactoryResetModal } from './factory-reset-modal';

/**
 * Section rendered on /settings/system that exposes the factory-reset action.
 *
 * The reset endpoint creates its own audit log via forgeDebug on the backend
 * (see apps/forge/src/admin/routes/system/reset.ts). There is no public
 * audit-history endpoint, so the UI surfaces only a static "last reset" hint
 * with a link to the documentation note.
 */
export function FactoryResetSection() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <section className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">Factory Reset</h3>
        <p className="text-sm text-muted-foreground">
          Apaga todos os dados de aplicação (LLM, agents, settings, schedules, internal-chat e
          webhooks) e restaura o sistema para o estado de fábrica. O schema do banco é preservado
          e um backup do banco é criado antes do reset.
        </p>
      </div>

      <div className="text-xs text-muted-foreground">
        As operações de reset são registradas em{' '}
        <span className="font-mono">forgeDebug</span> (level=info) com o caminho do backup e a
        lista de tabelas afetadas.
      </div>

      <div className="flex justify-end">
        <AdminButton variant="destructive" onClick={() => setModalOpen(true)}>
          Iniciar factory reset
        </AdminButton>
      </div>

      <FactoryResetModal open={modalOpen} onOpenChange={setModalOpen} />
    </section>
  );
}

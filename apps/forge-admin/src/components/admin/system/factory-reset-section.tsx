import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FactoryResetModal } from './factory-reset-modal';

/**
 * Section rendered on /settings/system that exposes the factory-reset action.
 *
 * Available to all authenticated roles per spec #6521 (D49, Nicolas). The
 * destructive operation is gated by:
 *   - z.literal("FACTORY_RESET") body confirmation (backend)
 *   - route-level admin API key or session auth (backend)
 *   - 2-step modal with literal-confirmation typing (this UI)
 *   - DB snapshot before any wipe (backend)
 *   - forgeDebug audit log (backend, see apps/forge/src/system/reset.ts)
 *
 * There is no public audit-history endpoint, so the UI surfaces only a static
 * "last reset" hint with a link to the documentation note.
 */
export function FactoryResetSection() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-foreground">Factory Reset</h3>
        <Badge variant="secondary">Disponível para todos os roles</Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Apaga todos os dados de aplicação (LLM, agents, settings, schedules, internal-chat e
        webhooks) e restaura o sistema para o estado de fábrica. O schema do banco é preservado
        e um backup do banco é criado antes do reset.
      </p>

      <div className="text-xs text-muted-foreground">
        As operações de reset são registradas em{' '}
        <span className="font-mono">forgeDebug</span> (level=info) com o caminho do backup e a
        lista de tabelas afetadas.
      </div>

      <div className="flex justify-end">
        <Button variant="destructive" onClick={() => setModalOpen(true)}>
          Iniciar factory reset
        </Button>
      </div>

      <FactoryResetModal open={modalOpen} onOpenChange={setModalOpen} />
    </section>
  );
}

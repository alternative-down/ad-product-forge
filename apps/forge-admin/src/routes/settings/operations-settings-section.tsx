import { AdminButton } from '@/components/admin';
import type { SettingsMutation, SettingsQuery } from './settings-types';
import type { OperationsDraft } from './settings-types';

type OperationSwitchFieldProps = {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
};

function OperationSwitchField({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: OperationSwitchFieldProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-sm border border-border px-4 py-3">
      <div className="space-y-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      <input
        type="checkbox"
        className="toggle"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
      />
    </div>
  );
}

type OperationsSettingsSectionProps = {
  operationsSettings: OperationsDraft;
  settingsQuery: SettingsQuery;
  settingsMutation: SettingsMutation;
  onOperationsDraftChange: (draft: OperationsDraft) => void;
};

export function OperationsSettingsSection({
  operationsSettings,
  settingsQuery,
  settingsMutation,
  onOperationsDraftChange,
}: OperationsSettingsSectionProps) {
  return (
    <section className="space-y-5 border-t border-border pt-6">
      <div className="space-y-1">
        <div className="text-lg font-semibold tracking-[-0.03em]">Operações</div>
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!settingsQuery.data) return;
          settingsMutation.mutate({
            ...settingsQuery.data,
            stepDelayEnabled: operationsSettings.stepDelayEnabled,
            communicationDmFlushingEnabled: operationsSettings.communicationDmFlushingEnabled,
            communicationGroupFlushingEnabled: operationsSettings.communicationGroupFlushingEnabled,
          });
        }}
      >
        <OperationSwitchField
          label="Step delay"
          description="Adiciona um atraso configurável entre cada step do generate. Útil para debugging ou para não saturar APIs externas."
          checked={operationsSettings.stepDelayEnabled}
          disabled={settingsMutation.isPending}
          onCheckedChange={(checked) =>
            onOperationsDraftChange({ ...operationsSettings, stepDelayEnabled: checked })
          }
        />

        <OperationSwitchField
          label="DM flushing (interno)"
          description="Activa o flush automático de DMs no canal interno. Quando ligado, o sistema limpa buffers de DMs ao fim de cada batch."
          checked={operationsSettings.communicationDmFlushingEnabled}
          disabled={settingsMutation.isPending}
          onCheckedChange={(checked) =>
            onOperationsDraftChange({ ...operationsSettings, communicationDmFlushingEnabled: checked })
          }
        />

        <OperationSwitchField
          label="Group flushing (interno)"
          description="Activa o flush automático de grupos no canal interno. Garante que as mensagens de grupo são libertadas em cada ciclo de generate."
          checked={operationsSettings.communicationGroupFlushingEnabled}
          disabled={settingsMutation.isPending}
          onCheckedChange={(checked) =>
            onOperationsDraftChange({ ...operationsSettings, communicationGroupFlushingEnabled: checked })
          }
        />

        {settingsMutation.error ? (
          <div className="text-sm text-destructive">{settingsMutation.error.message}</div>
        ) : null}

        <div className="flex justify-end">
          <AdminButton type="submit" disabled={settingsMutation.isPending}>
            {settingsMutation.isPending ? 'Salvando...' : 'Salvar operação'}
          </AdminButton>
        </div>
      </form>
    </section>
  );
}
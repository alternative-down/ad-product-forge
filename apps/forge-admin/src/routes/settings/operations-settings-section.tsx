import { AdminButton } from '@/components/admin';

type OperationsSettings = {
  stepDelayEnabled: boolean;
  communicationDmFlushingEnabled: boolean;
  communicationGroupFlushingEnabled: boolean;
};



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
  operationsSettings: OperationsSettings;
  settingsQuery: {
    data: { stepDelayEnabled: boolean; communicationDmFlushingEnabled: boolean; communicationGroupFlushingEnabled: boolean; [key: string]: unknown } | undefined;
  };
  settingsMutation: { mutate: (data: any) => void; isPending: boolean; error?: { message: string } | null; };
  onOperationsDraftChange: (draft: OperationsSettings | null) => void;
};

export function OperationsSettingsSection({
  operationsSettings,
  settingsQuery,
  settingsMutation,
  onOperationsDraftChange,
}: OperationsSettingsSectionProps) {
  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <div className="text-lg font-semibold tracking-[-0.03em]">Operação</div>
      </div>

      <form
        className="max-w-3xl space-y-3"
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
          label="Delay entre steps"
          description="Ativa o intervalo padrão entre execuções do runner."
          checked={operationsSettings.stepDelayEnabled}
          disabled={settingsMutation.isPending}
          onCheckedChange={(checked) =>
            onOperationsDraftChange({
              stepDelayEnabled: checked,
              communicationDmFlushingEnabled: operationsSettings.communicationDmFlushingEnabled,
              communicationGroupFlushingEnabled: operationsSettings.communicationGroupFlushingEnabled,
            })
          }
        />
        <OperationSwitchField
          label="Flushing de mensagens diretas"
          description="Controla se mensagens DM dos providers acordam agentes automaticamente."
          checked={operationsSettings.communicationDmFlushingEnabled}
          disabled={settingsMutation.isPending}
          onCheckedChange={(checked) =>
            onOperationsDraftChange({
              stepDelayEnabled: operationsSettings.stepDelayEnabled,
              communicationDmFlushingEnabled: checked,
              communicationGroupFlushingEnabled: operationsSettings.communicationGroupFlushingEnabled,
            })
          }
        />
        <OperationSwitchField
          label="Flushing de mensagens em grupo"
          description="Controla se mensagens de grupo dos providers acordam agentes automaticamente."
          checked={operationsSettings.communicationGroupFlushingEnabled}
          disabled={settingsMutation.isPending}
          onCheckedChange={(checked) =>
            onOperationsDraftChange({
              stepDelayEnabled: operationsSettings.stepDelayEnabled,
              communicationDmFlushingEnabled: operationsSettings.communicationDmFlushingEnabled,
              communicationGroupFlushingEnabled: checked,
            })
          }
        />
        <div className="flex justify-end">
          <AdminButton type="submit" disabled={settingsMutation.isPending}>
            {settingsMutation.isPending ? 'Salvando...' : 'Salvar operação'}
          </AdminButton>
        </div>
      </form>
    </section>
  );
}

import { AdminButton, AdminInput, AdminTextarea } from '@/components/admin';
import type { SettingsMutation, SettingsQuery } from './settings-types';
import type { CompanyDraft } from './settings-types';
import { AdminButton } from '@/components/admin/./forms/admin-button';
import { AdminInput } from '@/components/admin/./forms/admin-input';
import { AdminTextarea } from '@/components/admin/./forms/admin-textarea';
import type { SettingsMutation, SettingsQuery } from './settings.types';
import type { CompanyDraft } from './settings.types';

type CompanySettingsSectionProps = {
  companySettings: CompanyDraft;
  settingsQuery: SettingsQuery;
  settingsMutation: SettingsMutation;
  onCompanyDraftChange: (draft: CompanyDraft | null) => void;
};

export function CompanySettingsSection({
  companySettings,
  settingsQuery,
  settingsMutation,
  onCompanyDraftChange,
}: CompanySettingsSectionProps) {
  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <div className="text-lg font-semibold tracking-[-0.03em]">Empresa</div>
      </div>

      <form
        className="max-w-3xl space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!settingsQuery.data) return;
          settingsMutation.mutate({
            ...settingsQuery.data,
            companyName: companySettings.companyName.trim(),
            companyContext: companySettings.companyContext.trim(),
          });
        }}
      >
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="settings-company-name">
            Nome
          </label>
          <AdminInput
            id="settings-company-name"
            value={companySettings.companyName}
            onChange={(event) =>
              onCompanyDraftChange({
                companyName: event.target.value,
                companyContext: companySettings.companyContext,
              })
            }
            disabled={settingsMutation.isPending}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="settings-company-context">
            Descrição
          </label>
          <AdminTextarea
            id="settings-company-context"
            rows={8}
            value={companySettings.companyContext}
            onChange={(event) =>
              onCompanyDraftChange({
                companyName: companySettings.companyName,
                companyContext: event.target.value,
              })
            }
            disabled={settingsMutation.isPending}
          />
        </div>

        {settingsQuery.error ? (
          <div className="text-sm text-destructive">{settingsQuery.error.message}</div>
        ) : null}
        {settingsMutation.error ? (
          <div className="text-sm text-destructive">{settingsMutation.error.message}</div>
        ) : null}

        <div className="flex justify-end">
          <AdminButton type="submit" disabled={settingsMutation.isPending}>
            {settingsMutation.isPending ? 'Salvando...' : 'Salvar empresa'}
          </AdminButton>
        </div>
      </form>
    </section>
  );
}
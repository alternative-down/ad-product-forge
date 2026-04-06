import { AdminButton } from '@/components/admin';

export type OauthProviderView = {
  providerId: string;
  synced: boolean;
  accountId: string | null;
};

export function OauthSection(input: {
  providers: OauthProviderView[];
  pending: boolean;
  errorMessage?: string;
  onSync(providerId: string): void;
}) {
  return (
    <section className="space-y-5 border-t border-border pt-6">
      <div className="space-y-1">
        <div className="text-lg font-semibold tracking-[-0.03em]">OAuth</div>
        <div className="text-sm text-muted-foreground">
          Sincronize as credenciais locais usadas pelos providers LLM.
        </div>
      </div>

      <div className="space-y-3">
        {input.providers.map((provider) => (
          <div
            key={provider.providerId}
            className="flex items-center justify-between gap-4 rounded-sm border border-border px-4 py-3"
          >
            <div className="min-w-0 space-y-1">
              <div className="font-medium">{provider.providerId}</div>
              <div className="text-sm text-muted-foreground">
                {provider.synced
                  ? provider.accountId
                    ? `Sincronizado · ${provider.accountId}`
                    : 'Sincronizado'
                  : 'Ainda não sincronizado'}
              </div>
            </div>

            <AdminButton variant="outline" disabled={input.pending} onClick={() => input.onSync(provider.providerId)}>
              Sincronizar
            </AdminButton>
          </div>
        ))}
      </div>

      {input.errorMessage ? <div className="text-sm text-destructive">{input.errorMessage}</div> : null}
    </section>
  );
}

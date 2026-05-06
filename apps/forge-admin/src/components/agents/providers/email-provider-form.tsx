import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { AdminButton, AdminInput, PageHeader } from '@/components/admin';
import { Switch } from '@/components/ui/switch';
import {
  deleteAgentProvider,
  upsertAgentProvider,
  type EmailProviderCredentials,
} from '@/lib/admin-api/index';
import { failAdminAction, startAdminAction, succeedAdminAction } from '@/lib/admin-toast';

import { isEmailCredentialsValid, toEmailCredentials } from './-provider-credentials';

export function email-provider-form(input: {
  agentId: string;
  credentials: unknown;
  configured: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<EmailProviderCredentials | null>(null);
  const saveMutation = useMutation({
    mutationFn: upsertAgentProvider,
    onMutate: () => startAdminAction('Salvando email...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Email atualizado.');
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', input.agentId] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteAgentProvider(input.agentId, 'email'),
    onMutate: () => startAdminAction('Removendo email...'),
    onSuccess: async (_data, _variables, context) => {
      succeedAdminAction(context, 'Email removido.');
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'agent', input.agentId] });
    },
    onError: (error, _variables, context) => {
      failAdminAction(context, error);
    },
  });
  const credentials = draft ?? toEmailCredentials(input.credentials);
  const pending = saveMutation.isPending || deleteMutation.isPending;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageHeader
        title="Email"
        description="Configura o agente para ler e enviar e-mails pela caixa conectada."
      />

      <div className="max-w-3xl space-y-5">
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate({
              agentId: input.agentId,
              providerType: 'email',
              credentials,
            });
          }}
        >
          <ProviderSectionTitle title="IMAP" />
          <EmailConnectionFields
            prefix="imap"
            value={credentials.imap}
            disabled={pending}
            onChange={(nextValue) =>
              setDraft((current) => ({
                ...(current ?? toEmailCredentials(input.credentials)),
                imap: nextValue,
              }))
            }
          />

          <ProviderSectionTitle title="SMTP" />
          <EmailConnectionFields
            prefix="smtp"
            value={credentials.smtp}
            disabled={pending}
            onChange={(nextValue) =>
              setDraft((current) => ({
                ...(current ?? toEmailCredentials(input.credentials)),
                smtp: nextValue,
              }))
            }
          />

          {saveMutation.error ? <div className="text-sm text-destructive">{saveMutation.error.message}</div> : null}
          {deleteMutation.error ? <div className="text-sm text-destructive">{deleteMutation.error.message}</div> : null}

          <div className="flex justify-end gap-3">
            {input.configured ? (
              <AdminButton
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => deleteMutation.mutate()}
              >
                {deleteMutation.isPending ? 'Removendo...' : 'Remover'}
              </AdminButton>
            ) : null}
            <AdminButton type="submit" disabled={pending || !isEmailCredentialsValid(credentials)}>
              {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </AdminButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmailConnectionFields(input: {
  prefix: string;
  value: EmailProviderCredentials['imap'];
  disabled: boolean;
  onChange(value: EmailProviderCredentials['imap']): void;
}) {
  return (
    <div className="grid grid-cols-2 gap-5">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${input.prefix}-host`}>
          Host
        </label>
        <AdminInput
          id={`${input.prefix}-host`}
          value={input.value.host}
          onChange={(event) => input.onChange({ ...input.value, host: event.target.value })}
          disabled={input.disabled}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${input.prefix}-port`}>
          Porta
        </label>
        <AdminInput
          id={`${input.prefix}-port`}
          type="number"
          value={String(input.value.port)}
          onChange={(event) => input.onChange({ ...input.value, port: Number(event.target.value || 0) })}
          disabled={input.disabled}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${input.prefix}-user`}>
          Usuário
        </label>
        <AdminInput
          id={`${input.prefix}-user`}
          value={input.value.user}
          onChange={(event) => input.onChange({ ...input.value, user: event.target.value })}
          disabled={input.disabled}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${input.prefix}-password`}>
          Senha
        </label>
        <AdminInput
          id={`${input.prefix}-password`}
          type="password"
          value={input.value.password}
          onChange={(event) => input.onChange({ ...input.value, password: event.target.value })}
          disabled={input.disabled}
        />
      </div>

      <div className="col-span-2 space-y-2">
        <label className="text-sm font-medium" htmlFor={`${input.prefix}-secure`}>
          Seguro
        </label>
        <div className="flex min-h-9 items-center">
          <Switch
            id={`${input.prefix}-secure`}
            checked={input.value.secure}
            onCheckedChange={(checked) => input.onChange({ ...input.value, secure: checked })}
            disabled={input.disabled}
          />
        </div>
      </div>
    </div>
  );
}

function ProviderSectionTitle(input: {
  title: string;
}) {
  return <div className="text-sm font-medium text-foreground">{input.title}</div>;
}

import { LoaderCircle } from 'lucide-react';
import type { AgentDetail } from '../../../../lib/api';
import { formatDateTimeText } from '../../utils';
import { cn } from '../../../../lib/utils';
import { Button } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { Textarea } from '../../../../components/ui/textarea';
import { Badge } from '../../../../components/ui/badge';
import { buildProviderDraftKey, createProviderTemplate, toPrettyJson } from '../../utils';

export function AgentProvidersCard(input: {
  agent: AgentDetail;
  draftByKey: Record<string, { providerType: 'discord' | 'email'; credentialsText: string }>;
  newProviderDraft: { providerType: 'discord' | 'email'; credentialsText: string };
  onChangeProviderDraft(providerType: 'discord' | 'email', credentialsText: string): void;
  onChangeNewProviderDraft(draft: { providerType: 'discord' | 'email'; credentialsText: string }): void;
  onSaveProvider(providerType: 'discord' | 'email', credentialsText: string): void;
  onDeleteProvider(providerType: 'discord' | 'email'): void;
  onCreateProvider(): void;
  pendingProviderType: string | null;
  error: string | null;
}) {
  return (
    <Card className="p-6">
      <div>
        <h2 className="text-lg font-semibold">Providers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          External provider credentials are editable here. Internal chat remains system-managed.
        </p>
      </div>

      <div className="mt-5 space-y-4">
        {input.agent.providers.map((provider) => {
          const editableProviderType =
            provider.providerType === 'discord' || provider.providerType === 'email'
              ? provider.providerType
              : null;
          const key =
            editableProviderType
              ? buildProviderDraftKey(input.agent.agentId, editableProviderType)
              : null;
          const draft =
            key && input.draftByKey[key]
              ? input.draftByKey[key]
              : {
                  providerType: editableProviderType ?? 'discord',
                  credentialsText: toPrettyJson(provider.credentials),
                };

          return (
            <div key={provider.providerType} className="rounded-lg border border-border bg-accent/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{provider.providerType}</div>
                  <div className="text-xs text-muted-foreground">
                    Created at {formatDateTimeText(provider.createdAt)}
                  </div>
                </div>
                <Badge>{provider.editable ? 'editable' : 'read-only'}</Badge>
              </div>

              {provider.editable && editableProviderType ? (
                <>
                  <Textarea
                    className="mt-4 min-h-44 font-mono text-xs"
                    value={draft.credentialsText}
                    onChange={(event) => input.onChangeProviderDraft(editableProviderType, event.target.value)}
                    disabled={input.pendingProviderType === editableProviderType}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      className="h-8 px-3 text-xs"
                      onClick={() => input.onSaveProvider(editableProviderType, draft.credentialsText)}
                      disabled={
                        input.pendingProviderType === editableProviderType ||
                        draft.credentialsText === toPrettyJson(provider.credentials)
                      }
                    >
                      {input.pendingProviderType === editableProviderType ? (
                        <>
                          <LoaderCircle className="mr-2 h-3 w-3 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save changes'
                      )}
                    </Button>
                    <Button
                      className="h-8 px-3 text-xs"
                      variant="danger"
                      onClick={() => input.onDeleteProvider(editableProviderType)}
                      disabled={input.pendingProviderType === editableProviderType}
                    >
                      Delete
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          );
        })}

        <div className="rounded-lg border border-dashed border-border p-4">
          <h3 className="font-medium">Add new provider</h3>
          <div className="mt-3 grid gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  input.onChangeNewProviderDraft({
                    providerType: 'discord',
                    credentialsText: createProviderTemplate('discord'),
                  })
                }
                className={cn(
                  'rounded-lg border px-4 py-2 text-sm font-medium transition',
                  input.newProviderDraft.providerType === 'discord'
                    ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:bg-accent/50',
                )}
              >
                Discord
              </button>
              <button
                type="button"
                onClick={() =>
                  input.onChangeNewProviderDraft({
                    providerType: 'email',
                    credentialsText: createProviderTemplate('email'),
                  })
                }
                className={cn(
                  'rounded-lg border px-4 py-2 text-sm font-medium transition',
                  input.newProviderDraft.providerType === 'email'
                    ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:bg-accent/50',
                )}
              >
                Email
              </button>
            </div>
            <Textarea
              className="min-h-44 font-mono text-xs"
              value={input.newProviderDraft.credentialsText}
              onChange={(event) =>
                input.onChangeNewProviderDraft({
                  ...input.newProviderDraft,
                  credentialsText: event.target.value,
                })
              }
            />
            <Button className="h-8 px-3 text-xs" onClick={input.onCreateProvider}>
              Add provider
            </Button>
          </div>
        </div>

        {input.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {input.error}
          </div>
        )}
      </div>
    </Card>
  );
}

import { LoaderCircle } from 'lucide-react';
import type { AgentConfigDraft } from '../../types';
import { Button } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { Input } from '../../../../components/ui/input';
import { Select } from '../../../../components/ui/select';
import { Textarea } from '../../../../components/ui/textarea';
import { LabeledField } from '../../ui';

export function AgentConfigurationCard(input: {
  draft: AgentConfigDraft;
  profiles: Array<{ profileId: string; name: string; modelKey: string }>;
  pending: boolean;
  error: string | null;
  onChange(draft: AgentConfigDraft): void;
  onSubmit(draft: AgentConfigDraft): void;
}) {
  return (
    <Card className="p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Agent runtime config</h2>
        <p className="mt-1 text-sm text-slate-500">
          Updates the stored agent record and reloads the runtime if the agent is loaded.
        </p>
      </div>

      <form
        className="mt-5 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          input.onSubmit(input.draft);
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <LabeledField label="Name">
            <Input
              value={input.draft.name}
              onChange={(event) => input.onChange({ ...input.draft, name: event.target.value })}
              required
            />
          </LabeledField>
          <LabeledField label="Workspace embedder">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {input.draft.workspaceEmbedder}
            </div>
          </LabeledField>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <LabeledField label="Primary LLM profile">
            <Select
              value={input.draft.modelProfileId}
              onChange={(value) =>
                input.onChange({ ...input.draft, modelProfileId: value })
              }
              required
            >
              {input.profiles.map((profile) => (
                <option key={profile.profileId} value={profile.profileId}>
                  {profile.name} · {profile.modelKey}
                </option>
              ))}
            </Select>
          </LabeledField>
          <LabeledField label="OM profile">
            <Select
              value={input.draft.omModelProfileId}
              onChange={(value) =>
                input.onChange({ ...input.draft, omModelProfileId: value })
              }
              required
            >
              {input.profiles.map((profile) => (
                <option key={profile.profileId} value={profile.profileId}>
                  {profile.name} · {profile.modelKey}
                </option>
              ))}
            </Select>
          </LabeledField>
        </div>

        <LabeledField label="Description">
          <Textarea
            value={input.draft.description}
            onChange={(event) =>
              input.onChange({ ...input.draft, description: event.target.value })
            }
          />
        </LabeledField>

        <LabeledField label="Agent instructions">
          <Textarea
            className="min-h-56"
            value={input.draft.instructions}
            onChange={(event) =>
              input.onChange({ ...input.draft, instructions: event.target.value })
            }
            required
          />
        </LabeledField>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={input.draft.workspaceAutoSync}
              onChange={(event) =>
                input.onChange({ ...input.draft, workspaceAutoSync: event.target.checked })
              }
            />
            Workspace auto sync
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={input.draft.workspaceBm25}
              onChange={(event) =>
                input.onChange({ ...input.draft, workspaceBm25: event.target.checked })
              }
            />
            BM25 retrieval
          </label>
        </div>

        {input.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {input.error}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={input.pending}>
            {input.pending ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save config'
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}

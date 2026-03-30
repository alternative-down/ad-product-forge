import { UserPlus, LoaderCircle } from 'lucide-react';
import type { HireAgentResult } from '../../../lib/api';
import type { HireAgentDraft } from '../types';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { LabeledField } from '../ui';

export function HireAgentCard(input: {
  draft: HireAgentDraft;
  pending: boolean;
  error: string | null;
  result: HireAgentResult | null;
  onChange(draft: HireAgentDraft): void;
  onSubmit(draft: HireAgentDraft): void;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Hire agent</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Creates the agent, mailbox, execution contract, heartbeat, and GitHub app runtime.
          </p>
        </div>
        <UserPlus className="h-5 w-5 text-muted-foreground" />
      </div>

      <form
        className="mt-5 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          input.onSubmit(input.draft);
        }}
      >
        <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <LabeledField label="Hiring request">
            <Textarea
              value={input.draft.hiringRequest}
              onChange={(event) =>
                input.onChange({ ...input.draft, hiringRequest: event.target.value })
              }
              placeholder="Describe the kind of collaborator you need, expected responsibilities, context, and desired profile."
              required
            />
          </LabeledField>
          <LabeledField label="Weekly budget (USD)">
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={input.draft.weeklyBudgetUsd}
              onChange={(event) =>
                input.onChange({ ...input.draft, weeklyBudgetUsd: event.target.value })
              }
              required
            />
          </LabeledField>
        </div>

        <LabeledField label="Additional context">
          <Textarea
            value={input.draft.additionalContext}
            onChange={(event) =>
              input.onChange({ ...input.draft, additionalContext: event.target.value })
            }
            placeholder="Short operating context for the hiring workflow."
          />
        </LabeledField>

        {input.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {input.error}
          </div>
        )}

        {input.result && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <div>Agent created: {input.result.agentId}</div>
            {input.result.emailAddress ? <div>Email: {input.result.emailAddress}</div> : null}
            {input.result.githubAppRegistrationUrl ? (
              <a
                href={input.result.githubAppRegistrationUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block underline"
              >
                Open GitHub App registration
              </a>
            ) : null}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={input.pending}>
            {input.pending ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Hiring...
              </>
            ) : (
              'Hire agent'
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}

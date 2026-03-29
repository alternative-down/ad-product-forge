import type { AgentDetail } from '../../../../lib/api';
import { Card } from '../../../../components/ui/card';
import { ReadOnlyField } from '../../ui';

export function GitHubProvisioningCard(input: {
  provisioning: AgentDetail['githubProvisioning'];
}) {
  return (
    <Card className="p-6">
      <div>
        <h2 className="text-lg font-semibold">GitHub provisioning</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Hiring starts the GitHub App registration flow. The app only exists in GitHub after the
          registration URL is opened and completed.
        </p>
      </div>

      {!input.provisioning ? (
        <div className="mt-4 rounded-lg border border-border bg-accent/50 px-4 py-3 text-sm text-muted-foreground">
          No GitHub app provisioning exists for this agent.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <ReadOnlyField label="Status" value={input.provisioning.status} />
            <ReadOnlyField
              label="Registration URL"
              value={input.provisioning.registrationUrl}
              wrap
            />
            <ReadOnlyField
              label="Install URL"
              value={input.provisioning.installUrl ?? '—'}
              wrap
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href={input.provisioning.registrationUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-accent"
            >
              Open registration
            </a>
            {input.provisioning.installUrl ? (
              <a
                href={input.provisioning.installUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[color:var(--accent)] bg-[color:var(--accent)] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Open install
              </a>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}

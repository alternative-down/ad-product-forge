import type { AgentDetail } from '../../../../lib/api';
import { Card } from '../../../../components/ui/card';
import { ReadOnlyField } from '../../ui';

const secondaryLinkClass =
  'inline-flex h-11 items-center justify-center rounded-md border border-[color:var(--panel-border-strong)] bg-[color:var(--panel-strong)] px-5 text-sm font-semibold text-[color:var(--ink)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]';
const primaryLinkClass =
  'inline-flex h-11 items-center justify-center rounded-md border border-[color:var(--accent)] bg-[color:var(--accent)] px-5 text-sm font-semibold text-white transition hover:opacity-90';

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
        <div className="mt-4 rounded-lg border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] px-4 py-3 text-sm text-muted-foreground">
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
              className={secondaryLinkClass}
            >
              Open registration
            </a>
            {input.provisioning.installUrl ? (
              <a
                href={input.provisioning.installUrl}
                target="_blank"
                rel="noreferrer"
                className={primaryLinkClass}
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

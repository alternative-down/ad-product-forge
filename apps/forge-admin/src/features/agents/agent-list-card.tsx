import { Bot, UserPlus, Play, Square, LoaderCircle } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import type { AgentListItem } from '../../lib/api';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { buildAgentLocation } from './utils';

export function AgentListCard(input: {
  agents: AgentListItem[];
  isLoading: boolean;
  error: Error | null;
  onWake(agentId: string): void;
  onSleep(agentId: string): void;
  wakePending: string | null;
}) {
  if (input.isLoading) {
    return (
      <Card className="flex items-center gap-3 p-6 text-sm">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        Loading agents...
      </Card>
    );
  }

  if (input.error) {
    return (
      <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Failed to load agents: {input.error.message}
      </Card>
    );
  }

  if (input.agents.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-4 p-12 text-center">
        <Bot className="h-12 w-12 text-muted-foreground/50" />
        <div>
          <div className="text-lg font-semibold">No agents yet</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Hire your first agent to get started with your team.
          </div>
        </div>
        <Link
          to="/agents/hire"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-[color:var(--accent)] bg-[color:var(--accent)] px-5 text-sm font-medium text-white transition hover:opacity-90"
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Hire agent
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--ink)]">
            Team directory
          </h2>
          <p className="text-sm text-[color:var(--muted)]">
            {input.agents.length} agent{input.agents.length !== 1 ? 's' : ''} available in this workspace.
          </p>
        </div>
        <span className="hidden rounded-full border border-[color:var(--panel-border-strong)] bg-[color:var(--panel-strong)] px-3 py-1 text-xs font-medium text-[color:var(--muted)] sm:inline-flex">
          {input.agents.length} agent{input.agents.length !== 1 ? 's' : ''}
        </span>
        <Link
          to="/agents/hire"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-[color:var(--accent)] bg-[color:var(--accent)] px-5 text-sm font-medium text-white transition hover:opacity-90"
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Hire agent
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {input.agents.map((agent) => {
          const isPending = input.wakePending === agent.agentId;

          return (
            <Card
              key={agent.agentId}
              className="group overflow-hidden border-[color:var(--panel-border)] bg-[color:var(--panel)] p-0 transition hover:border-[color:var(--accent)] hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)]"
            >
              <Link
                to={buildAgentLocation({ agentId: agent.agentId, tab: 'runtime', runtimeView: 'assignment' })}
                className="block p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                      <span className="truncate font-semibold text-[color:var(--ink)] group-hover:text-[color:var(--accent)]">
                        {agent.name}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--muted)]">
                      {agent.functionName ?? 'No function assigned'}
                    </div>
                  </div>
                  <Badge
                    className={cn(
                      'shrink-0 border',
                      agent.executionState === 'running' &&
                        'border-emerald-200 bg-emerald-50 text-emerald-700',
                      agent.executionState === 'idle' &&
                        'border-[color:var(--panel-border-strong)] bg-[color:var(--panel-strong)] text-[color:var(--muted)]',
                    )}
                  >
                    {agent.executionState}
                  </Badge>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-[color:var(--panel-border)] pt-3 text-xs text-[color:var(--muted)]">
                  <span className="rounded-full bg-[color:var(--panel-strong)] px-2.5 py-1">
                    {agent.loaded ? 'Loaded' : 'Not loaded'}
                  </span>
                  {agent.runner ? (
                    <span className="rounded-full bg-[color:var(--panel-strong)] px-2.5 py-1">
                      {agent.runner.stopped
                        ? 'Stopped'
                        : agent.runner.executing
                          ? 'Executing'
                          : agent.runner.scheduled
                            ? 'Scheduled'
                            : 'Idle'}
                    </span>
                  ) : null}
                </div>
              </Link>

              <div
                className="flex gap-2 border-t border-[color:var(--panel-border)] bg-[color:var(--panel-strong)] px-4 py-3"
                onClick={(e) => e.preventDefault()}
              >
                {agent.runner?.stopped ? (
                  <Button
                    className="h-8 px-3 text-xs"
                    onClick={() => input.onWake(agent.agentId)}
                    disabled={isPending}
                  >
                    {isPending ? (
                      <LoaderCircle className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Play className="mr-1 h-3 w-3" />
                        Wake
                      </>
                    )}
                  </Button>
                ) : agent.executionState === 'running' ? (
                  <Button
                    className="h-8 px-3 text-xs"
                    variant="secondary"
                    onClick={() => input.onSleep(agent.agentId)}
                    disabled={isPending}
                  >
                    {isPending ? (
                      <LoaderCircle className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Square className="mr-1 h-3 w-3" />
                        Sleep
                      </>
                    )}
                  </Button>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

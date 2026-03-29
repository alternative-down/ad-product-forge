import { Bot, UserPlus, Play, Square, LoaderCircle } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import type { AgentListItem } from '../../../lib/api';
import { formatUsd } from '../../../lib/format';
import { cn } from '../../../lib/utils';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { buildAgentLocation } from '../utils';

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
      <Card className="flex items-center gap-3 p-6 text-sm text-slate-600">
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
        <Bot className="h-12 w-12 text-slate-300" />
        <div>
          <div className="text-lg font-semibold text-slate-900">No agents yet</div>
          <div className="mt-1 text-sm text-slate-500">
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
        <h2 className="text-lg font-semibold text-slate-950">
          {input.agents.length} agent{input.agents.length !== 1 ? 's' : ''}
        </h2>
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
            <Link
              key={agent.agentId}
              to={buildAgentLocation({ agentId: agent.agentId, tab: 'runtime', runtimeView: 'assignment' })}
              className="group rounded-lg border border-slate-200 bg-white p-4 transition hover:border-[color:var(--accent)] hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate font-semibold text-slate-950 group-hover:text-[color:var(--accent)]">
                      {agent.name}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {agent.function?.name ?? 'No function'}
                  </div>
                </div>
                <Badge
                  className={cn(
                    'shrink-0',
                    agent.status === 'running' && 'bg-emerald-100 text-emerald-800',
                    agent.status === 'stopped' && 'bg-slate-100 text-slate-600',
                    agent.status === 'error' && 'bg-red-100 text-red-800',
                  )}
                >
                  {agent.status}
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span>
                  Contract:{' '}
                  <span className="font-medium text-slate-700">
                    {formatUsd(agent.contract.budgetRemainingUsd)} left
                  </span>
                </span>
                <span>·</span>
                <span>
                  {agent.contract.executionCount} executions
                </span>
              </div>

              <div
                className="mt-3 flex gap-2"
                onClick={(e) => e.preventDefault()}
              >
                {agent.status === 'stopped' ? (
                  <Button
                    size="sm"
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
                ) : agent.status === 'running' ? (
                  <Button
                    size="sm"
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
            </Link>
          );
        })}
      </div>
    </div>
  );
}

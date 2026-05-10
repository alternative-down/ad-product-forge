import type { AgentDetail } from '@/lib/admin-api/index';

export type AgentProfileForm = {
  name: string;
  roleId: string;
  description: string;
  instructions: string;
  modelProfileId: string;
  omModelProfileId: string;
  workspaceAutoSync: boolean;
  workspaceBm25: boolean;
};

export function createAgentProfileForm(agent: AgentDetail): AgentProfileForm {
  return {
    name: agent.name,
    roleId: agent.role?.roleId ?? '',
    description: agent.description ?? '',
    instructions: agent.instructions,
    modelProfileId: agent.modelProfile?.profileId ?? '',
    omModelProfileId: agent.omModelProfile?.profileId ?? '',
    workspaceAutoSync: agent.workspace.autoSync,
    workspaceBm25: agent.workspace.bm25,
  };
}

export function getAgentInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return 'AG';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function humanizeAgentStatus(executionState: 'idle' | 'running' | 'absent') {
  if (executionState === 'running') {
    return 'Trabalhando';
  }

  if (executionState === 'absent') {
    return 'Ausente';
  }

  return 'Ocioso';
}

export function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatAverageInterval(steps: AgentDetail['recentExecutionSteps']) {
  if (steps.length < 2) {
    return 'Sem dados';
  }

  const sortedSteps = [...steps].sort((left, right) => left.createdAt - right.createdAt);
  let totalDiff = 0;

  for (let index = 1; index < sortedSteps.length; index += 1) {
    totalDiff += sortedSteps[index].createdAt - sortedSteps[index - 1].createdAt;
  }

  const averageMs = totalDiff / (sortedSteps.length - 1);
  const totalMinutes = Math.round(averageMs / 60000);

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${minutes} min`;
}

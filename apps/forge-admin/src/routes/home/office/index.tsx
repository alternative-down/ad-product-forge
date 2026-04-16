import { useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  ArrowUpRight,
  BriefcaseBusiness,
  Clock3,
  MoonStar,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';

import {
  AgentAvatar,
  AdminButton,
  AdminLoadingState,
  HireAgentDialog,
} from '@/components/admin';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getAgents, getSystemSettings } from '@/lib/admin-api';
import type { AgentListItem } from '@/lib/admin-api/types';

export const Route = createFileRoute('/home/office/')({
  component: HomeOfficeRoute,
});

type OfficeZoneId = 'work' | 'memory' | 'focus' | 'recovery';

type OfficeZone = {
  id: OfficeZoneId;
  label: string;
  description: string;
  icon: typeof BriefcaseBusiness;
  className: string;
  toneClassName: string;
};

type OfficePlacement = {
  agent: AgentListItem;
  zoneId: OfficeZoneId;
  row: number;
  column: number;
};

const OFFICE_ZONES: Record<OfficeZoneId, OfficeZone> = {
  work: {
    id: 'work',
    label: 'Floor de execucao',
    description: 'Loop ativo.',
    icon: BriefcaseBusiness,
    className:
      'left-[4%] top-[7%] h-[42%] w-[52%] border-emerald-200/70 bg-emerald-50/70',
    toneClassName: 'text-emerald-800',
  },
  memory: {
    id: 'memory',
    label: 'Arquivo',
    description: 'LTM e consolidacao.',
    icon: Archive,
    className:
      'right-[4%] top-[8%] h-[30%] w-[30%] border-amber-200/80 bg-amber-50/75',
    toneClassName: 'text-amber-800',
  },
  focus: {
    id: 'focus',
    label: 'Silencio',
    description: 'Aguardando contexto.',
    icon: MoonStar,
    className:
      'left-[8%] bottom-[22%] h-[20%] w-[38%] border-sky-200/80 bg-sky-50/75',
    toneClassName: 'text-sky-800',
  },
  recovery: {
    id: 'recovery',
    label: 'Excecoes',
    description: 'Retries e falhas.',
    icon: TriangleAlert,
    className:
      'right-[8%] bottom-[23%] h-[22%] w-[31%] border-rose-200/80 bg-rose-50/78',
    toneClassName: 'text-rose-800',
  },
};

function HomeOfficeRoute() {
  const settingsQuery = useQuery({
    queryKey: ['admin', 'system-settings'],
    queryFn: getSystemSettings,
  });
  const agentsQuery = useQuery({
    queryKey: ['admin', 'agents'],
    queryFn: getAgents,
    refetchInterval: 10_000,
  });
  const [hireOpen, setHireOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const agents = useMemo(() => agentsQuery.data ?? [], [agentsQuery.data]);
  const placements = useMemo(() => buildOfficePlacements(agents), [agents]);
  const activeSelectedAgentId = selectedAgentId && agents.some((agent) => agent.agentId === selectedAgentId)
    ? selectedAgentId
    : agents[0]?.agentId ?? null;
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.agentId === activeSelectedAgentId) ?? null,
    [activeSelectedAgentId, agents],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Office View
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.06em] text-foreground sm:text-4xl">
            {settingsQuery.data?.companyName?.trim() || 'Empresa'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Mapa operacional dos agentes com refresh de 10s.
          </p>
          {settingsQuery.isLoading && !settingsQuery.data ? <AdminLoadingState label="Carregando empresa..." /> : null}
        </div>

        <div className="flex items-center gap-2">
          <AdminButton
            type="button"
            variant="outline"
            onClick={() => {
              void agentsQuery.refetch();
              void settingsQuery.refetch();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </AdminButton>
          <AdminButton onClick={() => setHireOpen(true)}>
            Contratar
          </AdminButton>
        </div>
      </section>

      <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="relative overflow-hidden rounded-[1.7rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(249,248,246,0.96))] p-3 shadow-[0_14px_34px_rgba(15,23,42,0.05)] sm:p-4">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(254,240,138,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(186,230,253,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(216,180,254,0.14),transparent_30%)]" />
          <div className="relative min-h-[39rem] rounded-[1.45rem] bg-white/70">
            <div className="pointer-events-none absolute inset-x-[8%] top-[53%] h-px bg-border/35" />
            <div className="pointer-events-none absolute bottom-[23%] left-[58%] top-[12%] w-px bg-border/30" />

            {Object.values(OFFICE_ZONES).map((zone) => (
              <OfficeZoneBlock key={zone.id} zone={zone} />
            ))}

            {placements.map((placement) => (
              <OfficeAgentMarker
                key={placement.agent.agentId}
                placement={placement}
                selected={placement.agent.agentId === selectedAgent?.agentId}
                onSelect={() => setSelectedAgentId(placement.agent.agentId)}
              />
            ))}

            {agentsQuery.isLoading && agents.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <AdminLoadingState label="Montando escritorio..." />
              </div>
            ) : null}

            {agents.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
                Nenhum agente ainda. Contrate o primeiro colaborador para abrir o escritorio.
              </div>
            ) : null}

            <SelectedAgentOverlay agent={selectedAgent} />
          </div>
        </div>

        <aside className="min-h-0">
          <OfficeRoster
            agents={agents}
            selectedAgentId={selectedAgent?.agentId ?? null}
            onSelect={setSelectedAgentId}
          />
        </aside>
      </section>

      {agentsQuery.error ? <div className="text-sm text-destructive">{agentsQuery.error.message}</div> : null}
      <HireAgentDialog open={hireOpen} onOpenChange={setHireOpen} />
    </div>
  );
}

function OfficeZoneBlock(input: { zone: OfficeZone }) {
  const Icon = input.zone.icon;

  return (
    <div className={cn('absolute overflow-hidden rounded-[1.3rem] border p-4', input.zone.className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-medium tracking-[-0.03em] text-foreground">
            {input.zone.label}
          </div>
          <div className="text-[11px] leading-5 text-muted-foreground">
            {input.zone.description}
          </div>
        </div>
        <Icon className={cn('h-4 w-4', input.zone.toneClassName)} />
      </div>
    </div>
  );
}

function OfficeAgentMarker(input: {
  placement: OfficePlacement;
  selected: boolean;
  onSelect(): void;
}) {
  const style = getPlacementStyle(input.placement);

  return (
    <button
      type="button"
      onClick={input.onSelect}
      className={cn(
        'group absolute flex w-[7.1rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-[1.05rem] px-2 py-2 text-center transition duration-300',
        'hover:scale-[1.02] hover:bg-background/28 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        input.selected ? 'scale-[1.03] bg-background/42 shadow-[0_10px_24px_rgba(15,23,42,0.05)]' : '',
      )}
      style={style}
    >
      <div className={cn(
        'absolute inset-0 rounded-[1.05rem] border',
        getMarkerToneClass(input.placement.agent),
      )} />
      <AgentAvatar
        agentId={input.placement.agent.agentId}
        name={input.placement.agent.name}
        className="relative h-12 w-12 border border-border/60 bg-background shadow-sm"
        fallbackClassName="bg-background text-sm font-medium text-foreground"
      />
      <div className="relative line-clamp-1 text-sm font-medium tracking-[-0.02em] text-foreground">
        {input.placement.agent.name}
      </div>
      <div className="relative line-clamp-1 text-[11px] text-muted-foreground/90">
        {input.placement.agent.roleName ?? humanizeAgentStatus(input.placement.agent.executionState)}
      </div>
    </button>
  );
}

function SelectedAgentOverlay(input: { agent: AgentListItem | null }) {
  if (!input.agent) {
    return null;
  }

  return (
    <section className="absolute inset-x-4 bottom-4 z-10 rounded-[1.25rem] bg-background/86 p-4 backdrop-blur-sm shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-3">
          <div className="flex items-start gap-4">
            <AgentAvatar
              agentId={input.agent.agentId}
              name={input.agent.name}
              className="h-14 w-14 border border-border/60 bg-muted"
              fallbackClassName="bg-muted text-base font-medium text-foreground"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold tracking-[-0.05em] text-foreground">
                  {input.agent.name}
                </h2>
                <Badge variant="outline" className="rounded-full bg-background/85">
                  {humanizeAgentStatus(input.agent.executionState)}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {input.agent.roleName ?? 'Sem papel'}
              </div>
            </div>
          </div>

          {input.agent.overview.lastStepPreview ? (
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Ultimo thinking / texto
              </div>
              <div className="text-sm leading-6 text-foreground">
                {input.agent.overview.lastStepPreview}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <InspectorRow
              icon={Clock3}
              label="Ultima step"
              value={input.agent.overview.lastStepAt
                ? `${formatDateTime(input.agent.overview.lastStepAt)} · ${formatRelativeTime(input.agent.overview.lastStepAt)}`
                : '—'}
            />
            <InspectorRow
              icon={Sparkles}
              label="Contexto"
              value={formatTokenCount(input.agent.overview.lastStepContextTokens)}
            />
            <InspectorRow
              icon={MoonStar}
              label="Media"
              value={formatDuration(input.agent.overview.averageStepIntervalMs)}
            />
            <InspectorRow
              icon={Archive}
              label="LTM"
              value={input.agent.overview.ltm.running ? 'Executando' : input.agent.overview.ltm.queued ? 'Enfileirada' : 'Ociosa'}
            />
          </div>

          {input.agent.overview.om ? (
            <div className="space-y-2.5">
              <OmMetricBar label="RAW" current={input.agent.overview.om.recentRawTokenCount} limit={input.agent.overview.om.recentRawTokenLimit} />
              <OmMetricBar label="Overflow" current={input.agent.overview.om.overflowTokenCount} limit={input.agent.overview.om.overflowTokenLimit} />
              <OmMetricBar label="Obs" current={input.agent.overview.om.observationTokenCount} limit={input.agent.overview.om.observationTokenLimit} />
              <OmMetricBar label="Ref" current={input.agent.overview.om.reflectionTokenCount} limit={input.agent.overview.om.reflectionTokenLimit} />
            </div>
          ) : null}

          <Link
            to="/agents/$agentId"
            params={{ agentId: input.agent.agentId }}
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-foreground/80"
          >
            Abrir detalhes do agente
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function OfficeRoster(input: {
  agents: AgentListItem[];
  selectedAgentId: string | null;
  onSelect(agentId: string): void;
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-[1.3rem] bg-background/55 p-2">
      <div className="px-2 pb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Equipe
      </div>

      <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
        {input.agents.map((agent) => (
          <button
            key={agent.agentId}
            type="button"
            onClick={() => input.onSelect(agent.agentId)}
            className={cn(
              'flex items-center gap-3 rounded-[0.95rem] px-3 py-2 text-left transition-colors',
              input.selectedAgentId === agent.agentId
                ? 'bg-background shadow-sm'
                : 'bg-transparent hover:bg-background/55',
            )}
          >
            <AgentAvatar
              agentId={agent.agentId}
              name={agent.name}
              className="h-10 w-10 border border-border/60 bg-muted"
              fallbackClassName="bg-muted text-xs font-medium text-foreground"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{agent.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {agent.overview.lastStepPreview ?? humanizeAgentStatus(agent.executionState)}
              </div>
            </div>
            <div className={cn(
              'h-2.5 w-2.5 rounded-full',
              agent.executionState === 'running'
                ? 'bg-emerald-400'
                : agent.executionState === 'absent'
                  ? 'bg-rose-400'
                  : 'bg-sky-400',
            )} />
          </button>
        ))}
      </div>
    </section>
  );
}

function InspectorRow(input: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  const Icon = input.icon;

  return (
    <div className="rounded-[0.95rem] bg-muted/22 px-3 py-3">
      <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {input.label}
      </div>
      <div className="text-sm font-medium text-foreground">{input.value}</div>
    </div>
  );
}

function OmMetricBar(input: {
  label: string;
  current: number;
  limit: number;
}) {
  const percent = getPressurePercent(input.current, input.limit);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>{input.label}</span>
        <span>{formatNullableNumber(input.current)} / {formatNullableNumber(input.limit)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground/75 transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function buildOfficePlacements(agents: AgentListItem[]) {
  const placements: OfficePlacement[] = [];
  const groupedAgents: Record<OfficeZoneId, AgentListItem[]> = {
    work: [],
    memory: [],
    focus: [],
    recovery: [],
  };

  for (const agent of agents) {
    groupedAgents[getZoneForAgent(agent)].push(agent);
  }

  for (const zoneId of Object.keys(groupedAgents) as OfficeZoneId[]) {
    groupedAgents[zoneId].forEach((agent, index) => {
      placements.push({
        agent,
        zoneId,
        row: Math.floor(index / 3),
        column: index % 3,
      });
    });
  }

  return placements;
}

function getZoneForAgent(agent: AgentListItem): OfficeZoneId {
  if (agent.executionState === 'absent') {
    return 'recovery';
  }

  if (agent.overview.ltm.running) {
    return 'memory';
  }

  if (agent.executionState === 'idle') {
    return 'focus';
  }

  return 'work';
}

function getPlacementStyle(placement: OfficePlacement) {
  const layout = {
    work: { baseLeft: 18, baseTop: 24, columnGap: 15, rowGap: 16 },
    memory: { baseLeft: 72, baseTop: 24, columnGap: 11, rowGap: 16 },
    focus: { baseLeft: 20, baseTop: 74, columnGap: 15, rowGap: 14 },
    recovery: { baseLeft: 74, baseTop: 74, columnGap: 11, rowGap: 14 },
  } satisfies Record<OfficeZoneId, {
    baseLeft: number;
    baseTop: number;
    columnGap: number;
    rowGap: number;
  }>;

  const zoneLayout = layout[placement.zoneId];

  return {
    left: `${zoneLayout.baseLeft + placement.column * zoneLayout.columnGap}%`,
    top: `${zoneLayout.baseTop + placement.row * zoneLayout.rowGap}%`,
  };
}

function getMarkerToneClass(agent: AgentListItem) {
  if (agent.executionState === 'absent') {
    return 'border-rose-300/60 bg-rose-50/18';
  }

  if (agent.executionState === 'running') {
    return 'border-emerald-300/45 bg-emerald-50/14';
  }

  return 'border-sky-300/40 bg-sky-50/12';
}

function getPressurePercent(current: number, limit: number) {
  if (limit <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((current / limit) * 100)));
}

function humanizeAgentStatus(executionState: 'idle' | 'running' | 'absent') {
  if (executionState === 'running') {
    return 'Trabalhando';
  }

  if (executionState === 'absent') {
    return 'Ausente';
  }

  return 'Ocioso';
}

function formatNullableNumber(value: number | null) {
  if (value === null) {
    return '—';
  }

  return new Intl.NumberFormat('pt-BR').format(value);
}

function formatTokenCount(value: number | null) {
  if (value === null) {
    return '—';
  }

  return `${formatNullableNumber(value)} tokens`;
}

function formatRelativeTime(value: number | null) {
  if (!value) {
    return '—';
  }

  const diffMs = Math.max(Date.now() - value, 0);
  const diffSeconds = Math.floor(diffMs / 1_000);

  if (diffSeconds < 60) {
    return `${diffSeconds}s`;
  }

  return `${Math.floor(diffSeconds / 60)} min`;
}

function formatDuration(value: number | null) {
  if (!value) {
    return '—';
  }

  const seconds = Math.max(1, Math.round(value / 1_000));

  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${Math.round(seconds / 60)} min`;
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

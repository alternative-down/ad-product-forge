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

export const Route = createFileRoute('/home/')({
  component: HomeIndexRoute,
});

type OfficeZoneId = 'work' | 'memory' | 'focus' | 'recovery';

type OfficeZone = {
  id: OfficeZoneId;
  label: string;
  description: string;
  icon: typeof BriefcaseBusiness;
  className: string;
  chipClassName: string;
};

type OfficePlacement = {
  agent: AgentListItem;
  zoneId: OfficeZoneId;
  row: number;
  column: number;
  count: number;
};

const OFFICE_ZONES: Record<OfficeZoneId, OfficeZone> = {
  work: {
    id: 'work',
    label: 'Floor de execução',
    description: 'Agentes trabalhando em loop ativo.',
    icon: BriefcaseBusiness,
    className:
      'left-[4%] top-[7%] h-[46%] w-[52%] border-emerald-200/70 bg-[linear-gradient(180deg,rgba(240,253,250,0.95),rgba(231,249,245,0.92))] shadow-[0_18px_40px_rgba(74,222,128,0.08)]',
    chipClassName: 'border-emerald-300/70 bg-emerald-50/90 text-emerald-900',
  },
  memory: {
    id: 'memory',
    label: 'Arquivo & memória',
    description: 'LTM ativa, consolidação e estudo.',
    icon: Archive,
    className:
      'right-[4%] top-[8%] h-[34%] w-[32%] border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.97),rgba(254,243,199,0.88))] shadow-[0_16px_32px_rgba(251,191,36,0.12)]',
    chipClassName: 'border-amber-300/70 bg-amber-50/95 text-amber-900',
  },
  focus: {
    id: 'focus',
    label: 'Área silenciosa',
    description: 'Agentes ociosos aguardando contexto novo.',
    icon: MoonStar,
    className:
      'left-[8%] bottom-[7%] h-[27%] w-[42%] border-sky-200/80 bg-[linear-gradient(180deg,rgba(239,246,255,0.96),rgba(224,242,254,0.9))] shadow-[0_16px_30px_rgba(56,189,248,0.1)]',
    chipClassName: 'border-sky-300/70 bg-sky-50/95 text-sky-900',
  },
  recovery: {
    id: 'recovery',
    label: 'Mesa de exceções',
    description: 'Ausências, retries e estados degradados.',
    icon: TriangleAlert,
    className:
      'right-[8%] bottom-[8%] h-[30%] w-[34%] border-rose-200/80 bg-[linear-gradient(180deg,rgba(255,241,242,0.96),rgba(ffe4e6,0.9))] shadow-[0_16px_34px_rgba(244,63,94,0.1)]',
    chipClassName: 'border-rose-300/70 bg-rose-50/95 text-rose-900',
  },
};

function HomeIndexRoute() {
  const settingsQuery = useQuery({
    queryKey: ['admin', 'system-settings'],
    queryFn: getSystemSettings,
  });
  const agentsQuery = useQuery({
    queryKey: ['admin', 'agents'],
    queryFn: getAgents,
    refetchInterval: 60_000,
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
    <div className="flex min-h-0 flex-1 flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            Office View
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.06em] text-foreground sm:text-4xl">
            {settingsQuery.data?.companyName?.trim() || 'Empresa'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Um mapa vivo do estado operacional dos agentes.
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

      <section className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1.42fr)_minmax(20rem,0.58fr)]">
        <div className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(250,250,249,0.94))] p-3 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-4">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(254,240,138,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(186,230,253,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(216,180,254,0.14),transparent_30%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,transparent,rgba(226,232,240,0.55))]" />

          <div className="relative min-h-[36rem] rounded-[1.6rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.64),rgba(255,255,255,0.82))]">
            <div className="pointer-events-none absolute inset-x-[8%] top-[53%] h-px bg-border/60" />
            <div className="pointer-events-none absolute left-[58%] top-[12%] bottom-[14%] w-px bg-border/50" />

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
                <AdminLoadingState label="Montando escritório..." />
              </div>
            ) : null}

            {agents.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
                Nenhum agente ainda. Contrate o primeiro colaborador para abrir o escritório.
              </div>
            ) : null}
          </div>
        </div>

        <aside className="flex min-h-0 flex-col gap-4">
          <OfficeInspector agent={selectedAgent} />
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
    <div className={cn('absolute overflow-hidden rounded-[1.7rem] border p-4', input.zone.className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold tracking-[-0.03em] text-foreground">
            {input.zone.label}
          </div>
          <div className="max-w-[18rem] text-xs leading-5 text-muted-foreground">
            {input.zone.description}
          </div>
        </div>
        <div className={cn('rounded-full border px-2.5 py-2', input.zone.chipClassName)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function OfficeAgentMarker(input: {
  placement: OfficePlacement;
  selected: boolean;
  onSelect(): void;
}) {
  const status = humanizeAgentStatus(input.placement.agent.executionState);
  const urgency = getAgentUrgency(input.placement.agent);
  const style = getPlacementStyle(input.placement);

  return (
    <button
      type="button"
      onClick={input.onSelect}
      className={cn(
        'group absolute flex w-[7.4rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-[1.4rem] px-2 py-2 text-center transition duration-300',
        'hover:scale-[1.03] hover:bg-background/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        input.selected ? 'scale-[1.04] bg-background/70 shadow-[0_16px_36px_rgba(15,23,42,0.12)]' : '',
      )}
      style={style}
    >
      <div
        className={cn(
          'absolute inset-0 rounded-[1.4rem] border transition-colors',
          urgency === 'high'
            ? 'border-rose-300/80 bg-rose-50/30'
            : urgency === 'medium'
              ? 'border-amber-300/70 bg-amber-50/25'
              : 'border-border/60 bg-background/20',
        )}
      />
      <AgentAvatar
        agentId={input.placement.agent.agentId}
        name={input.placement.agent.name}
        className="relative h-12 w-12 border border-border/70 bg-background shadow-sm"
        fallbackClassName="bg-background text-sm font-medium text-foreground"
      />
      <div className="relative line-clamp-1 text-sm font-medium tracking-[-0.02em] text-foreground">
        {input.placement.agent.name}
      </div>
      <div className="relative line-clamp-1 text-[11px] text-muted-foreground">
        {status}
      </div>
      <div className="relative max-w-full rounded-full bg-foreground px-2 py-1 text-[10px] leading-none text-background shadow-sm">
        {getAgentActivityLabel(input.placement.agent)}
      </div>
    </button>
  );
}

function OfficeInspector(input: { agent: AgentListItem | null }) {
  if (!input.agent) {
    return (
      <section className="rounded-[1.8rem] border border-border/70 bg-background/90 p-5 text-sm text-muted-foreground shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        Selecione um agente no escritório.
      </section>
    );
  }

  const om = input.agent.overview.om;

  return (
    <section className="space-y-4 rounded-[1.8rem] border border-border/70 bg-background/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <div className="flex items-start gap-4">
        <AgentAvatar
          agentId={input.agent.agentId}
          name={input.agent.name}
          className="h-16 w-16 border border-border bg-muted"
          fallbackClassName="bg-muted text-base font-medium text-foreground"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-semibold tracking-[-0.05em] text-foreground">
              {input.agent.name}
            </h2>
            <Badge variant="outline" className="rounded-full">
              {humanizeAgentStatus(input.agent.executionState)}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            {input.agent.roleName ?? 'Sem papel'}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <InspectorRow
          icon={Clock3}
          label="Última step"
          value={input.agent.overview.lastStepAt
            ? `${formatDateTime(input.agent.overview.lastStepAt)} · ${formatRelativeTime(input.agent.overview.lastStepAt)}`
            : '—'}
        />
        <InspectorRow
          icon={Sparkles}
          label="Contexto da step"
          value={formatTokenCount(input.agent.overview.lastStepContextTokens)}
        />
        <InspectorRow
          icon={MoonStar}
          label="Média entre steps"
          value={formatDuration(input.agent.overview.averageStepIntervalMs)}
        />
        <InspectorRow
          icon={Archive}
          label="LTM"
          value={input.agent.overview.ltm.running ? 'Executando' : input.agent.overview.ltm.queued ? 'Enfileirada' : 'Ociosa'}
        />
      </div>

      {om ? (
        <div className="space-y-2 rounded-[1.4rem] border border-border/70 bg-muted/25 p-4">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Pressão de contexto
          </div>
          <OmMetricBar label="RAW" current={om.recentRawTokenCount} limit={om.recentRawTokenLimit} />
          <OmMetricBar label="Overflow" current={om.overflowTokenCount} limit={om.overflowTokenLimit} />
          <OmMetricBar label="Observations" current={om.observationTokenCount} limit={om.observationTokenLimit} />
          <OmMetricBar label="Reflections" current={om.reflectionTokenCount} limit={om.reflectionTokenLimit} />
        </div>
      ) : null}

      <AdminButton asChild variant="outline">
        <Link to="/agents/$agentId" params={{ agentId: input.agent.agentId }}>
          Abrir agente
          <ArrowUpRight className="ml-2 h-4 w-4" />
        </Link>
      </AdminButton>
    </section>
  );
}

function OfficeRoster(input: {
  agents: AgentListItem[];
  selectedAgentId: string | null;
  onSelect(agentId: string): void;
}) {
  return (
    <section className="min-h-0 rounded-[1.8rem] border border-border/70 bg-background/92 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <div className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Equipe
      </div>

      <div className="space-y-2">
        {input.agents.map((agent) => (
          <button
            key={agent.agentId}
            type="button"
            onClick={() => input.onSelect(agent.agentId)}
            className={cn(
              'flex w-full items-center gap-3 rounded-[1.2rem] border px-3 py-3 text-left transition',
              input.selectedAgentId === agent.agentId
                ? 'border-foreground/15 bg-muted/40'
                : 'border-border/60 bg-background hover:bg-muted/25',
            )}
          >
            <AgentAvatar
              agentId={agent.agentId}
              name={agent.name}
              className="h-10 w-10 border border-border bg-muted"
              fallbackClassName="bg-muted text-sm font-medium text-foreground"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{agent.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {agent.roleName ?? 'Sem papel'} · {getAgentActivityLabel(agent)}
              </div>
            </div>
            <Badge variant="outline" className="rounded-full">
              {humanizeAgentStatus(agent.executionState)}
            </Badge>
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
    <div className="rounded-[1.2rem] border border-border/70 bg-muted/20 px-3 py-3">
      <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
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
  const percent = input.limit > 0
    ? Math.max(0, Math.min(100, Math.round((input.current / input.limit) * 100)))
    : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="uppercase tracking-[0.14em] text-muted-foreground">{input.label}</span>
        <span className="text-muted-foreground">
          {formatNullableNumber(input.current)} / {formatNullableNumber(input.limit)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border/60">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,rgba(244,114,182,0.82),rgba(56,189,248,0.82))] transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function buildOfficePlacements(agents: AgentListItem[]): OfficePlacement[] {
  const zoneGroups: Record<OfficeZoneId, AgentListItem[]> = {
    work: [],
    memory: [],
    focus: [],
    recovery: [],
  };

  for (const agent of agents) {
    zoneGroups[getZoneForAgent(agent)].push(agent);
  }

  return (Object.entries(zoneGroups) as Array<[OfficeZoneId, AgentListItem[]]>)
    .flatMap(([zoneId, zoneAgents]) =>
      zoneAgents.map((agent, index) => ({
        agent,
        zoneId,
        row: Math.floor(index / 3),
        column: index % 3,
        count: zoneAgents.length,
      })),
    );
}

function getZoneForAgent(agent: AgentListItem): OfficeZoneId {
  if (agent.executionState === 'absent') {
    return 'recovery';
  }

  if (agent.overview.ltm.running) {
    return 'memory';
  }

  if (agent.executionState === 'running') {
    return 'work';
  }

  return 'focus';
}

function getPlacementStyle(input: OfficePlacement) {
  const base = {
    work: { x: 13, y: 24, xGap: 15, yGap: 17 },
    memory: { x: 73, y: 23, xGap: 12, yGap: 16 },
    focus: { x: 16, y: 76, xGap: 15, yGap: 13 },
    recovery: { x: 72, y: 74, xGap: 12, yGap: 14 },
  } satisfies Record<OfficeZoneId, { x: number; y: number; xGap: number; yGap: number }>;
  const zone = base[input.zoneId];

  return {
    left: `${zone.x + (input.column * zone.xGap)}%`,
    top: `${zone.y + (input.row * zone.yGap)}%`,
  };
}

function getAgentActivityLabel(agent: AgentListItem) {
  if (agent.overview.ltm.running) {
    return 'Consolidando memória';
  }

  if (agent.executionState === 'absent') {
    return 'Em retry';
  }

  if (agent.executionState === 'running') {
    return 'Em execução';
  }

  return 'Aguardando contexto';
}

function getAgentUrgency(agent: AgentListItem) {
  if (agent.executionState === 'absent') {
    return 'high';
  }

  const om = agent.overview.om;

  if (!om) {
    return 'low';
  }

  const pressure = Math.max(
    getPressurePercent(om.recentRawTokenCount, om.recentRawTokenLimit),
    getPressurePercent(om.overflowTokenCount, om.overflowTokenLimit),
    getPressurePercent(om.observationTokenCount, om.observationTokenLimit),
    getPressurePercent(om.reflectionTokenCount, om.reflectionTokenLimit),
  );

  if (pressure >= 85) {
    return 'high';
  }

  if (pressure >= 60) {
    return 'medium';
  }

  return 'low';
}

function getPressurePercent(current: number, limit: number) {
  if (limit <= 0) {
    return 0;
  }

  return Math.round((current / limit) * 100);
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

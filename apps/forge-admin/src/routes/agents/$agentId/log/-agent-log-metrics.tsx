import type { AgentLogRuntimeMemoryData } from './use-agent-log-data';

interface MetricTileProps {
  label: string;
  current: number;
  unit?: string;
  limit?: number;
  detail?: string;
}

function MetricTile({ label, current, unit, limit, detail }: MetricTileProps) {
  const percent = limit && limit > 0 ? Math.min(999, Math.round((current / limit) * 100)) : null;

  return (
    <div className="rounded-2xl border border-border/80 bg-background/70 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">
        {formatNumber(current)} {unit ?? 'tokens'}
      </div>
      {limit ? (
        <div className="mt-1 text-xs text-muted-foreground">
          de {formatNumber(limit)} • {percent}%
        </div>
      ) : null}
      {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value);
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

interface AgentLogMetricsProps {
  metrics: NonNullable<AgentLogRuntimeMemoryData['metrics']>;

  updatedAt: number | null;
  lastObservedAt: number | null;
  checkpointMessageId: string | null;
  checkpointGeneration: number | null;
  checkpointUpdatedAt: number | null;
}

export function AgentLogMetrics({
  metrics,
  updatedAt,
  lastObservedAt,
  checkpointMessageId,
  checkpointGeneration,
  checkpointUpdatedAt,
}: AgentLogMetricsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <MetricTile
        label="RAW recente"
        current={metrics.recentRawTokenCount}
        limit={metrics.recentRawTokenLimit}
        detail={`${formatNumber(metrics.recentRawMessageCount)} itens ativos`}
      />
      <MetricTile
        label="Overflow RAW"
        current={metrics.overflowTokenCount}
        limit={metrics.observationTriggerTokenLimit}
        detail={`${formatNumber(metrics.overflowMessageCount)} itens fora da reserva`}
      />
      <MetricTile
        label="Observations"
        current={metrics.observationTokenCount}
        limit={metrics.reflectionTriggerTokenLimit}
        detail={`${formatNumber(metrics.activeObservationBlockCount)} blocos ativos`}
      />
      <MetricTile
        label="Reflections"
        current={metrics.reflectionTokenCount}
        limit={metrics.reflectionBudget}
        detail={`${formatNumber(metrics.activeReflectionBlockCount)} blocos ativos`}
      />
      <MetricTile
        label="Checkpoint Summary"
        current={metrics.checkpointTokenCount}
        detail={
          metrics.checkpointSummaryUpToGeneration !== null
            ? `até geração ${formatNumber(metrics.checkpointSummaryUpToGeneration)}`
            : 'sem summary persistido'
        }
      />
      <MetricTile
        label="RAW ativo após checkpoint"
        current={metrics.rawMessageCount}
        unit="itens"
        detail={
          metrics.latestThreadMessageAt
            ? `última mensagem ${formatDateTime(metrics.latestThreadMessageAt)}`
            : checkpointMessageId
              ? 'sem mensagens após checkpoint'
              : 'sem checkpoint ativo'
        }
      />
    </div>
  );
}

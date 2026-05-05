import { ChevronDown } from 'lucide-react';

import type { AgentLogRuntimeMemoryData } from './-use-agent-log-data';
import { AgentLogMetrics } from './-agent-log-metrics';

interface AgentRuntimeMemorySectionProps {
  workingMemory: string | null;
  agentContext: string | null;
  executionState: 'idle' | 'running' | 'absent';
  lastExecutionError: string | null;
  lastExecutionErrorAt: number | null;
  observations: string | null;
  reflection: string | null;
  generationCount: number | null;
  updatedAt: number | null;
  lastObservedAt: number | null;
  checkpointMessageId: string | null;
  checkpointGeneration: number | null;
  checkpointSummary: string | null;
  checkpointUpdatedAt: number | null;
  metrics: AgentLogRuntimeMemoryData['metrics'];
  loading: boolean;
  error: string | null;
}

function MemoryDisclosure({ title, value }: { title: string; value: string | null }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>{title}</span>
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="pt-3">
        {value ? (
          <div className="max-w-full min-w-0 overflow-x-auto whitespace-pre-wrap break-all rounded-2xl border border-border/80 bg-background/70 p-4 text-xs leading-6 text-foreground [overflow-wrap:anywhere]">
            {value}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Sem dados.</div>
        )}
      </div>
    </details>
  );
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

export function AgentRuntimeMemorySection({
  workingMemory,
  agentContext,
  executionState,
  lastExecutionError,
  lastExecutionErrorAt,
  observations,
  reflection,
  generationCount,
  updatedAt,
  lastObservedAt,
  checkpointMessageId,
  checkpointGeneration,
  checkpointSummary,
  checkpointUpdatedAt,
  metrics,
  loading,
  error,
}: AgentRuntimeMemorySectionProps) {
  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando memória do agente...</div>;
  }

  if (error) {
    return <div className="text-sm text-destructive">{error}</div>;
  }

  if (!workingMemory && !agentContext && !observations && !reflection) {
    if (!checkpointSummary) {
      return null;
    }
  }

  return (
    <section className="space-y-4 border-b border-border pb-6">
      <header className="space-y-1">
        <h2 className="text-sm font-medium text-foreground">Memória</h2>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {generationCount !== null ? <span>OM generation: {generationCount}</span> : null}
          {updatedAt ? <span>Atualizada: {formatDateTime(updatedAt)}</span> : null}
          {lastObservedAt ? <span>Última observação: {formatDateTime(lastObservedAt)}</span> : null}
          {checkpointMessageId ? <span>Checkpoint message: {checkpointMessageId}</span> : null}
          {checkpointGeneration !== null ? <span>Checkpoint: {checkpointGeneration}</span> : null}
          {checkpointUpdatedAt ? <span>Checkpoint atualizado: {formatDateTime(checkpointUpdatedAt)}</span> : null}
        </div>
      </header>

      {metrics ? (
        <AgentLogMetrics
          metrics={metrics}
          generationCount={generationCount}
          updatedAt={updatedAt}
          lastObservedAt={lastObservedAt}
          checkpointMessageId={checkpointMessageId}
          checkpointGeneration={checkpointGeneration}
          checkpointUpdatedAt={checkpointUpdatedAt}
        />
      ) : null}

      <MemoryDisclosure
        title="Status de ausência"
        value={
          executionState === 'absent' || lastExecutionError
            ? [
                `estado: ${executionState}`,
                `motivo: ${lastExecutionError ?? '—'}`,
                lastExecutionErrorAt ? `desde: ${formatDateTime(lastExecutionErrorAt)}` : null,
              ]
                .filter(Boolean)
                .join('\n')
            : null
        }
      />

      <MemoryDisclosure
        title="Working Memory"
        value={workingMemory}
      />
      <MemoryDisclosure
        title="AGENT_CONTEXT.md"
        value={agentContext}
      />
      <MemoryDisclosure
        title="Checkpoint Summary"
        value={checkpointSummary}
      />
      <MemoryDisclosure
        title="Observations"
        value={observations}
      />
      <MemoryDisclosure
        title="Reflection"
        value={reflection}
      />
    </section>
  );
}

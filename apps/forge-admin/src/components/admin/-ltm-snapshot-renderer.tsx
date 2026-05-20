import type { AgentLongTermMemoryRecallDebugSearchResult } from '@/lib/admin-api/agent-types';
import { formatDateTime, formatNumber, MemoryDisclosure, MetricTile } from './-ltm-ui-utils';

interface LtmRecallSnapshotRendererProps {
  result: AgentLongTermMemoryRecallDebugSearchResult;
}

export function LtmRecallSnapshotRenderer({ result }: LtmRecallSnapshotRendererProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-border/80 bg-background/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Index ativo"
          current={result.activeIndexStats?.count ?? 0}
          unit="vetores"
          detail={
            result.activeIndexStats
              ? `dim ${formatNumber(result.activeIndexStats.dimension)} • ${result.activeIndexStats.metric ?? '—'}`
              : 'índice não encontrado'
          }
        />
        <MetricTile
          label="Workspace hits"
          current={result.workspaceResults.length}
          unit="resultados"
          detail={`${result.searchMode} • topK ${formatNumber(result.topK)}`}
        />
        <MetricTile
          label="Vector hits"
          current={result.vectorResults.length}
          unit="resultados"
          detail={`embed dim ${formatNumber(result.queryEmbeddingDimension)}`}
        />
        <MetricTile
          label="Graph"
          current={result.graphSourcesCount}
          unit="sources"
          detail={`topK ${formatNumber(result.graphTopK)} • threshold ${result.graphThreshold}`}
        />
      </div>

      <MemoryDisclosure title="Query usada" value={result.query || '—'} />
      <MemoryDisclosure title="Texto final injetado" value={result.injectedSystemMessage} />
      <MemoryDisclosure
        title="Estado do índice"
        value={[
          `workspace.canBM25: ${result.workspaceCanBm25 ? 'yes' : 'no'}`,
          `workspace.canVector: ${result.workspaceCanVector ? 'yes' : 'no'}`,
          `workspace.canHybrid: ${result.workspaceCanHybrid ? 'yes' : 'no'}`,
          `activeIndexName: ${result.activeIndexName}`,
          `availableIndexes: ${result.availableIndexes.join(', ') || '—'}`,
          `indexCount: ${result.activeIndexStats ? formatNumber(result.activeIndexStats.count) : '—'}`,
          `dimension: ${result.activeIndexStats ? formatNumber(result.activeIndexStats.dimension) : '—'}`,
          `metric: ${result.activeIndexStats?.metric ?? '—'}`,
          `lastInitAt: ${result.lastInitAt ? formatDateTime(result.lastInitAt) : '—'}`,
        ].join('\n')}
      />
      <MemoryDisclosure title="Embedding da query" value={JSON.stringify(result.queryEmbedding)} />
      <MemoryDisclosure
        title="Workspace formatado"
        value={result.workspaceFormattedContext || null}
      />
      <MemoryDisclosure title="Graph query" value={result.graphQuery || null} />
      <MemoryDisclosure
        title="Graph config"
        value={[
          `dimension: ${formatNumber(result.graphDimension)}`,
          `includeSources: ${result.graphIncludeSources ? 'yes' : 'no'}`,
          `hit: ${result.graphHit ? 'yes' : 'no'}`,
          `sourcesCount: ${formatNumber(result.graphSourcesCount)}`,
        ].join('\n')}
      />

      {result.workspaceResults.length > 0 ? (
        <div className="space-y-3">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Workspace results
          </div>
          {result.workspaceResults.map((r) => (
            <div
              key={r.id}
              className="space-y-2 rounded-2xl border border-border/80 bg-background/70 p-4"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{r.id}</span>
                <span>score bruto: {r.score !== null ? r.score.toFixed(4) : '—'}</span>
                <span>
                  percentual relativo:{' '}
                  {r.relativePercent !== null ? `${r.relativePercent.toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="whitespace-pre-wrap break-all text-xs leading-6 text-foreground [overflow-wrap:anywhere]">
                {r.content || 'Sem conteúdo.'}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Nenhum resultado de workspace.</div>
      )}

      {result.vectorResults.length > 0 ? (
        <div className="space-y-3">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Vector index results
          </div>
          {result.vectorResults.map((r) => (
            <div
              key={r.id}
              className="space-y-2 rounded-2xl border border-border/80 bg-background/70 p-4"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{r.id}</span>
                <span>score: {r.score.toFixed(4)}</span>
              </div>
              <MemoryDisclosure title="Metadata" value={r.metadataJson} />
              <MemoryDisclosure title="Document" value={r.document} />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Nenhum resultado vector.</div>
      )}

      {(function () {
        try {
          return JSON.parse(result.graphSourcesJson ?? '[]').length > 0;
        } catch {
          return false;
        }
      })() ? (
        <div className="space-y-3">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Graph sources
          </div>
          {JSON.parse(result.graphSourcesJson ?? '[]').map((source, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border/80 bg-background/70 p-4 text-xs text-foreground"
            >
              {source}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

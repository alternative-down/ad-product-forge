import type { AgentLongTermMemoryRecallDebugSearchResult } from '@/lib/admin-api/agent-types';
import { formatDateTime, formatNumber, MetricTile, MemoryDisclosure } from './-ltm-ui-utils';
import { LtmRecallSearchForm } from './-ltm-snapshot-search-form';
import { LtmRecallSnapshotRenderer } from './-ltm-snapshot-renderer';
import { type FormEvent } from 'react';

interface LtmState {
  running: boolean;
  queued: boolean;
  lastRunAt: number | null;
  lastRunError: string | null;
  lastRunErrorAt: number | null;
  lastWrittenPackageId: string | null;
  lastWrittenAt: number | null;
  packageCount: number;
}

interface LtmRecallState {
  status: 'hit' | 'miss' | 'error';
  query: string;
  resultIds: string[];
  resultCount: number;
  resultScores: number[];
  graphHit: boolean;
  stepsJson: string;
  updatedAt: number;
  lastInitAt: number | null;
  searchMode: string;
  topK: number;
  graphTopK: number;
  graphThreshold: number;
  graphRandomWalkSteps: number;
  indexPaths: string[];
  workspaceFileCount: number;
  memoryFileCount: number;
  checkpointFileCount: number;
  error: string | null;
}

interface LongTermMemorySectionProps {
  ltm: LtmState | null;
  ltmRecall: LtmRecallState | null;
  recallSearch: AgentLongTermMemoryRecallDebugSearchResult | null;
  recallSearchLoading: boolean;
  recallSearchError: string | null;
  onRecallSearchSubmit: (event: FormEvent<HTMLFormElement>) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  loading: boolean;
  error: string | null;
}

export function LongTermMemorySection({
  ltm,
  ltmRecall,
  recallSearch,
  recallSearchLoading,
  recallSearchError,
  onRecallSearchSubmit,
  searchQuery,
  onSearchQueryChange,
  loading,
  error,
}: LongTermMemorySectionProps) {
  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando estado da LTM...</div>;
  }

  if (error) {
    return <div className="text-sm text-destructive">{error}</div>;
  }

  if (!ltm && !ltmRecall) {
    return null;
  }

  return (
    <section className="space-y-4 border-b border-border pb-6">
      {ltm ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricTile
            label="LTM pacotes"
            current={ltm.packageCount}
            unit="pacotes"
            detail={
              ltm.running
                ? 'workflow em execução'
                : ltm.queued
                  ? 'execução enfileirada'
                  : 'workflow ocioso'
            }
          />
          <MetricTile
            label="LTM escritos"
            current={ltm.packageCount}
            unit="pacotes"
            detail={
              ltm.lastWrittenAt
                ? `último write ${formatDateTime(ltm.lastWrittenAt)}`
                : 'nenhum pacote escrito'
            }
          />
        </div>
      ) : null}

      <MemoryDisclosure
        title="LTM status"
        value={
          ltm
            ? [
                `running: ${ltm.running ? 'yes' : 'no'}`,
                `queued: ${ltm.queued ? 'yes' : 'no'}`,
                `lastRunAt: ${ltm.lastRunAt ? formatDateTime(ltm.lastRunAt) : '—'}`,
                `lastRunError: ${ltm.lastRunError ?? '—'}`,
                `lastRunErrorAt: ${ltm.lastRunErrorAt ? formatDateTime(ltm.lastRunErrorAt) : '—'}`,
                `lastWrittenPackageId: ${ltm.lastWrittenPackageId ?? '—'}`,
                `lastWrittenAt: ${ltm.lastWrittenAt ? formatDateTime(ltm.lastWrittenAt) : '—'}`,
                `packageCount: ${formatNumber(ltm.packageCount)}`,
              ].join('\n')
            : null
        }
      />

      <MemoryDisclosure
        title="LTM Recall"
        value={
          ltmRecall
            ? [
                `status: ${ltmRecall.status}`,
                `updatedAt: ${formatDateTime(ltmRecall.updatedAt)}`,
                `lastInitAt: ${ltmRecall.lastInitAt ? formatDateTime(ltmRecall.lastInitAt) : '—'}`,
                `searchMode: ${ltmRecall.searchMode}`,
                `topK: ${formatNumber(ltmRecall.topK)}`,
                `graphTopK: ${formatNumber(ltmRecall.graphTopK)}`,
                `graphThreshold: ${ltmRecall.graphThreshold}`,
                `graphRandomWalkSteps: ${formatNumber(ltmRecall.graphRandomWalkSteps)}`,
                `graphHit: ${ltmRecall.graphHit ? 'yes' : 'no'}`,
                `indexPaths: ${ltmRecall.indexPaths.join(', ') || '—'}`,
                `workspaceFileCount: ${formatNumber(ltmRecall.workspaceFileCount)}`,
                `memoryFileCount: ${formatNumber(ltmRecall.memoryFileCount)}`,
                `checkpointFileCount: ${formatNumber(ltmRecall.checkpointFileCount)}`,
                `resultCount: ${formatNumber(ltmRecall.resultCount)}`,
                `resultIds: ${ltmRecall.resultIds.join(', ') || '—'}`,
                `resultScores: ${ltmRecall.resultScores.map((s) => s.toFixed(4)).join(', ') || '—'}`,
                `error: ${ltmRecall.error ?? '—'}`,
                '',
                ltmRecall.query,
              ].join('\n')
            : null
        }
      />

      <MemoryDisclosure title="LTM Recall Steps JSON" value={ltmRecall?.stepsJson ?? null} />

      <LtmRecallSearchForm
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        onRecallSearchSubmit={onRecallSearchSubmit}
        recallSearchLoading={recallSearchLoading}
        recallSearchError={recallSearchError}
      >
        {recallSearch ? <LtmRecallSnapshotRenderer result={recallSearch} /> : null}
      </LtmRecallSearchForm>
    </section>
  );
}

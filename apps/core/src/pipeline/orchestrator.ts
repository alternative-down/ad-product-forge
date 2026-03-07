import {
  type IngestDependencies,
  type PipelineInput,
  type PipelineOutput,
  ingest,
} from '../index.js';
import { createArtifactStore, type ArtifactStore } from './graph/artifact-store.js';
import { runGraphStage } from './graph/graph-transformer.js';
import { createInsightStore, type InsightStore } from './insight/insight-store.js';
import { runInsightStage } from './insight/insight-engine.js';
import { createScoreStore, type ScoreStore, runScoreStage } from './score/score-engine.js';

export type NextAction = 'forward' | 'retry' | 'drop';

type StageName = 'ingest' | 'graph' | 'insight' | 'score';

export interface PipelineOrchestratorDeps {
  now?: () => Date;
  parentJobId?: string | null;
  artifactBaseDir?: string;
  ingestDeps?: IngestDependencies;
  graphStore?: ArtifactStore;
  insightStore?: InsightStore;
  scoreStore?: ScoreStore;
}

export interface PipelineRunResult {
  stage: StageName;
  nextAction: NextAction;
  ingestOutput: PipelineOutput;
  graphOutput?: PipelineOutput;
  insightOutput?: PipelineOutput;
  scoreOutput?: PipelineOutput;
  finalOutput: PipelineOutput;
}

const NEXT_ACTION_BY_STATUS: Record<PipelineOutput['status'], NextAction> = {
  ok: 'forward',
  retry: 'retry',
  error: 'drop',
};

export async function runPipelineV1(input: PipelineInput, deps: PipelineOrchestratorDeps = {}): Promise<PipelineRunResult> {
  const now = deps.now ?? (() => new Date());
  const artifactBaseDir = deps.artifactBaseDir ?? './artifacts';

  const ingestOutput = await ingest(
    input,
    {
      ...deps.ingestDeps,
      now,
    },
    deps.parentJobId,
  );

  if (ingestOutput.status !== 'ok') {
    return {
      stage: 'ingest',
      nextAction: NEXT_ACTION_BY_STATUS[ingestOutput.status],
      ingestOutput,
      finalOutput: ingestOutput,
    };
  }

  const graphOutput = await runGraphStage(input, ingestOutput, {
    now,
    store: deps.graphStore ?? createArtifactStore(artifactBaseDir),
  });

  if (graphOutput.status !== 'ok') {
    return {
      stage: 'graph',
      nextAction: NEXT_ACTION_BY_STATUS[graphOutput.status],
      ingestOutput,
      graphOutput,
      finalOutput: graphOutput,
    };
  }

  const insightStore = deps.insightStore ?? createInsightStore(artifactBaseDir);

  const insightOutput = await runInsightStage(input, graphOutput, {
    now,
    store: insightStore,
  });

  if (insightOutput.status !== 'ok') {
    return {
      stage: 'insight',
      nextAction: NEXT_ACTION_BY_STATUS[insightOutput.status],
      ingestOutput,
      graphOutput,
      insightOutput,
      finalOutput: insightOutput,
    };
  }

  const scoreOutput = await runScoreStage(insightOutput, {
    now,
    insightStore,
    scoreStore: deps.scoreStore ?? createScoreStore(artifactBaseDir),
  });

  return {
    stage: 'score',
    nextAction: NEXT_ACTION_BY_STATUS[scoreOutput.status],
    ingestOutput,
    graphOutput,
    insightOutput,
    scoreOutput,
    finalOutput: scoreOutput,
  };
}

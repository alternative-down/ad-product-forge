import { type SourceType } from '../index.js';
import { normalizeToPipelineInput, type SourcePayload } from '../ingress/normalizer.js';
import { runPipelineV1, type PipelineOrchestratorDeps, type PipelineRunResult } from './orchestrator.js';

export interface SourceRunRequest {
  sourceType: SourceType;
  payload: SourcePayload;
}

export async function runPipelineFromSource(
  request: SourceRunRequest,
  deps: PipelineOrchestratorDeps = {},
): Promise<PipelineRunResult> {
  const normalizedInput = normalizeToPipelineInput(request.sourceType, request.payload);
  return runPipelineV1(normalizedInput, deps);
}

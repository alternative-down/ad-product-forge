import { type SourceType } from '../index';
import { normalizeToPipelineInput, type SourcePayload } from '../ingress/normalizer';
import { runPipelineV1, type PipelineOrchestratorDeps, type PipelineRunResult } from './orchestrator';

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

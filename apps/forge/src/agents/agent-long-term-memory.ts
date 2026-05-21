/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/require-await */
import { createId } from '../utils/id';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  WorkspaceEmbedderId,
  createRuntimeAgentSession,
  forgeDebug,
  type ConversationStore,
  type RuntimeActionDefinition,
  toMastraSafeIdentifier,
} from '@forge-runtime/core';
import { serializeError } from './agent-runner-error-formatting';
import { z } from 'zod';

import {
  createAgentLongTermMemoryStore,
  type LongTermMemoryState,
  type CheckpointPackageManifest,
  type CheckpointedOmCheckpointPackageInput,
  type CheckpointedOmPackageEntry,
} from './ltm/store';
import { createAgentContractStore } from './agent-contract-store';
import { renderCheckpointPackageReadme, renderReflectionFile, renderObservationFile } from './agent-ltm-checkpoint-render';
import {
  readLtmState,
  writeLtmState,
  markLtmRecallIndexDirty,
  scheduleLtmRun,
  clearLtmTimer,
  applyLtmStateToSnapshot,
} from './agent-ltm-schedule-helpers';
import {
  computeCheckpointTimestamp,
  formatCheckpointPackageId,
  writeCheckpointFiles,
  buildCheckpointPackageManifest,
  commitCheckpointPackage,
  cleanupTempPackage,
  getTempPackagePath,
  prepareTempPackageDirectory,
} from './agent-ltm-checkpoint-io-helpers';

import { withTimeout } from '../utils/async';
const CHECKPOINTS_DIR = 'checkpoints';
const MEMORY_DIR = 'memory';
const SKILLS_DIR = path.join('workspace', 'skills');
const GENERATE_TIMEOUT_MS = 5 * 60_000;
const GENERATE_MAX_ATTEMPTS = 2;
const GENERATE_RETRY_BACKOFF_MS = 10_000;
const GENERATE_MAX_STEPS_PER_RUN = 10_000;


import {
  LtmUsage,
  LtmSnapshot,
  createMemoryAgentInstructions,
  getUsageFromGenerateResult,
} from './agent-ltm-generate-helpers';
async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}


async function listRelativeFiles(rootPath: string, relativeRoot: string) {
  const absoluteRoot = path.resolve(rootPath, relativeRoot);
  const entries = await fs.readdir(absoluteRoot, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeRoot.replace(/\\/g, '/'), entry.name);

    if (entry.isDirectory()) {
      files.push(...await listRelativeFiles(rootPath, relativePath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    files.push(relativePath);
  }

  return files.sort();
}

async function snapshotTrackedFiles(agentWorkspacePath: string) {
  const filePaths = [
    ...await listRelativeFiles(agentWorkspacePath, path.posix.join('workspace', 'memory', MEMORY_DIR)),
    ...await listRelativeFiles(agentWorkspacePath, SKILLS_DIR.replace(/\\/g, '/')),
  ];
  const snapshot = new Map<string, string>();

  for (const relativePath of filePaths) {
    const absolutePath = path.resolve(agentWorkspacePath, relativePath);
    let content = '';
    try { content = await fs.readFile(absolutePath, 'utf8'); } catch { /* file not readable */ }
    snapshot.set(relativePath, content);
  }

  return snapshot;
}

function diffTrackedFiles(before: Map<string, string>, after: Map<string, string>) {
  const changed = new Set<string>();

  for (const [relativePath, nextContent] of after.entries()) {
    if (before.get(relativePath) !== nextContent) {
      changed.add(relativePath);
    }
  }

  for (const relativePath of before.keys()) {
    if (!after.has(relativePath)) {
      changed.add(relativePath);
    }
  }

  return Array.from(changed).sort();
}
export function createAgentLongTermMemory(input: {
  agentId: string;
  agentName: string;
  agentDescription?: string;
  roleName?: string;
  roleDescription?: string;
  instructions: string;
  agentWorkspacePath: string;
  agentMemoryPath: string;
  threadId: string;
  resourceId: string;
  model: unknown;
  pricingModelKey: string;
  modelProfileId?: string;
  contractStore: ReturnType<typeof createAgentContractStore>;
  conversationStore: ConversationStore;
  workspaceActions: Array<RuntimeActionDefinition<Record<string, unknown>, unknown>>;
  workspaceEmbedder?: WorkspaceEmbedderId;
  persistenceStore: any;
}) {
  const checkpointsPath = path.resolve(input.agentMemoryPath, CHECKPOINTS_DIR);
  const memoryPath = path.resolve(input.agentMemoryPath, MEMORY_DIR);
  const ltmMastraId = toMastraSafeIdentifier(`${input.agentId}_long_term_memory`);
  let memoryAgent: Awaited<ReturnType<typeof createRuntimeAgentSession>> | null = null;

  let initialized = false;
  let idle = false;
  let running = false;
  let stopped = false;
  const timerRef = { current: null as NodeJS.Timeout | null };
  let currentAbortController: AbortController | null = null;
  let refreshRecallIndex: (() => Promise<void>) | null = null;
  const snapshot: LtmSnapshot = {
    running: false,
    queued: false,
    lastRunAt: null,
    lastRunError: null,
    lastRunErrorAt: null,
    lastWrittenPackageId: null,
    lastWrittenAt: null,
    packageCount: 0,
  };

  function clearTimer() {
    clearLtmTimer(timerRef);
  }

  async function ensureInitialized() {
    if (initialized) {
      return;
    }

    await fs.mkdir(checkpointsPath, { recursive: true });
    await fs.mkdir(memoryPath, { recursive: true });
    memoryAgent = await createRuntimeAgentSession({
      agentId: ltmMastraId,
      agentName: `${input.agentName} Long-Term Memory`,
      threadId: ltmMastraId,
      resourceId: ltmMastraId,
      assistantAuthorId: ltmMastraId,
      model: input.model as never,
      system: createMemoryAgentInstructions({
        agentId: input.agentId,
        agentName: input.agentName,
        agentDescription: input.agentDescription,
        roleName: input.roleName,
        roleDescription: input.roleDescription,
        instructions: input.instructions,
      }),
      conversationStore: input.conversationStore,
      runtimeActions: input.workspaceActions,
      consolidateConversationOverflow: false,
    });
    initialized = true;
  }

  async function readState() {
    await ensureInitialized();
    return await readLtmState(input.persistenceStore);
  }

  async function writeState(state: LongTermMemoryState) {
    await ensureInitialized();
    const persistedState = await writeLtmState(input.persistenceStore, state);
    applyLtmStateToSnapshot(snapshot as Parameters<typeof applyLtmStateToSnapshot>[0], {
      lastRunAt: persistedState.lastRunAt,
      lastRunError: persistedState.lastRunError,
      lastRunErrorAt: persistedState.lastRunErrorAt,
      lastWrittenPackageId: persistedState.lastWrittenPackageId,
      lastWrittenAt: persistedState.lastWrittenAt,
      packages: persistedState.packages,
    });
  }

  async function markRecallIndexDirty(reason: string) {
    await ensureInitialized();
    await markLtmRecallIndexDirty(input.persistenceStore, reason);
  }

  function scheduleRun(delayMs: number) {
    scheduleLtmRun(delayMs, stopped, idle, timerRef, runMemoryWorkflow);
  }

  async function writeCheckpointPackage(payload: CheckpointedOmCheckpointPackageInput) {
    const state = await readState();
    const existing = (state.packages ?? []).find((entry: any) => entry.checkpointGeneration === payload.toGeneration);

    if (existing) {
      return existing;
    }

    const checkpointTimestamp = computeCheckpointTimestamp(payload);
    const dayKey = new Date(checkpointTimestamp).toISOString().slice(0, 10);
    const sequence = (state.packages ?? [])
      .filter((entry: any): boolean => entry.packageId !== null && entry.packageId !== undefined && entry.packageId.startsWith(`${dayKey}_`))
      .length + 1;
    const packageId = formatCheckpointPackageId(dayKey, sequence - 1);
    const packagePath = path.resolve(checkpointsPath, packageId);
    const tempPackagePath = getTempPackagePath(packagePath);

    forgeDebug({ scope: 'ltm', level: 'info', message: 'checkpoint package write start', context: {
      agentId: input.agentId,
      threadId: payload.threadId,
      packageId,
      checkpointGeneration: payload.toGeneration,
      reflectionCount: (payload as any).reflections.length,
      observationCount: (payload as any).observations.length,
    } });


      const manifest = buildCheckpointPackageManifest(packageId, payload, checkpointTimestamp);

      (state.packages ?? []).push(manifest);
      state.lastWrittenPackageId = packageId;
      state.lastWrittenAt = new Date(checkpointTimestamp).toISOString();
      state.lastRunError = null;
      state.lastRunErrorAt = null;
      await writeState(state);
      await markRecallIndexDirty('checkpoint-write');
      await refreshRecallIndex?.();

    forgeDebug({ scope: 'ltm', level: 'info', message: 'checkpoint package write complete', context: {
      agentId: input.agentId,
      threadId: payload.threadId,
      packageId,
      checkpointGeneration: payload.toGeneration,
    } });

    return manifest;
  }

  async function recordLtmStep(usage: LtmUsage) {
    const contract = await input.contractStore.getRunnableContract(input.agentId);
    if (!contract) {
      return;
    }
    const pricing = await input.contractStore.getUsagePricing({
      pricingModelKey: input.pricingModelKey,
      profileId: input.modelProfileId ?? '',
    });

    let costUsd = 0;

    if (pricing.modelPrice) {
      const uncachedInputTokens = Math.max(usage.inputTokens - usage.cachedInputTokens, 0);
      costUsd =
        ((uncachedInputTokens / 1_000_000) * pricing.modelPrice.inputPerMillionUsd
          + (usage.cachedInputTokens / 1_000_000) * pricing.modelPrice.inputCachePerMillionUsd
          + (usage.outputTokens / 1_000_000) * pricing.modelPrice.outputPerMillionUsd)
        * pricing.contractCostMultiplier;
    }

    await input.contractStore.recordAgentStep({
      agentId: input.agentId,
      contractId: contract.id,
      llmProfileId: input.modelProfileId ?? '',
      modelKey: (input.pricingModelKey as string),
      kind: 'ltm',
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
      inputPerMillionUsd: pricing.modelPrice?.inputPerMillionUsd ?? 0,
      inputCachePerMillionUsd: pricing.modelPrice?.inputCachePerMillionUsd ?? 0,
      outputPerMillionUsd: pricing.modelPrice?.outputPerMillionUsd ?? 0,
      contractCostMultiplier: pricing.contractCostMultiplier,
      costUsd,
    });
  }

  async function estimateNextLtmDelayMs() {
    const contract = await input.contractStore.getRunnableContract(input.agentId);
    if (!contract) {
      return 0;
    }
    const pricing = await input.contractStore.getUsagePricing({
      pricingModelKey: input.pricingModelKey,
      profileId: input.modelProfileId ?? '',
    });

    const recentSteps = await input.contractStore.listRecentSteps(input.agentId, 10);

    if (recentSteps.length === 0 || !pricing.modelPrice) {
      return 0;
    }

    const averageInputTokens =
      recentSteps.reduce((total: number, step: { inputTokens: number; cachedInputTokens: number; outputTokens: number }) => total + step.inputTokens, 0) / recentSteps.length;
    const averageCachedInputTokens =
      recentSteps.reduce((total: number, step: { inputTokens: number; cachedInputTokens: number; outputTokens: number }) => total + step.cachedInputTokens, 0) / recentSteps.length;
    const averageOutputTokens =
      recentSteps.reduce((total: number, step: { inputTokens: number; cachedInputTokens: number; outputTokens: number }) => total + step.outputTokens, 0) / recentSteps.length;
    const averageUncachedInputTokens = Math.max(averageInputTokens - averageCachedInputTokens, 0);
    const estimatedStepUsd =
      ((averageUncachedInputTokens / 1_000_000) * pricing.modelPrice.inputPerMillionUsd
        + (averageCachedInputTokens / 1_000_000) * pricing.modelPrice.inputCachePerMillionUsd
        + (averageOutputTokens / 1_000_000) * pricing.modelPrice.outputPerMillionUsd)
      * pricing.contractCostMultiplier;

    if (estimatedStepUsd <= 0) {
      return 0;
    }

    const spentUsd = await input.contractStore.getContractSpend(contract.id);
    const remainingBudgetUsd = contract.budgetUsd - spentUsd;
    const remainingTimeMs = contract.endsAt - Date.now();
    const stepsPossible = remainingBudgetUsd / estimatedStepUsd;

    if (remainingTimeMs <= 0 || stepsPossible <= 0) {
      return 0;
    }

    return Math.max(0, Math.round(remainingTimeMs / stepsPossible));
  }

  async function generateLtmRun(prompt: string) {
    await ensureInitialized();

    if (!memoryAgent) {
      forgeDebug({ scope: 'ltm', level: 'warn', message: 'initializeLtmSession: runtime not available', context: { agentId: input.agentId } });
      throw new Error(`LTM runtime session is not available for ${input.agentId}`);
    }

    let result: Awaited<ReturnType<typeof memoryAgent.generate>> | null = null;
    const runDelayMs = await estimateNextLtmDelayMs();

    for (let attempt = 1; attempt <= GENERATE_MAX_ATTEMPTS; attempt += 1) {
      try {
        const controller = new AbortController();
        currentAbortController = controller;
        result = await withTimeout(
          memoryAgent.generate(prompt, {
            maxSteps: GENERATE_MAX_STEPS_PER_RUN,
            savePerStep: true,
            abortSignal: controller.signal,
            prepareStep: async ({ stepNumber }) => {
              if (stepNumber === 0 || runDelayMs <= 0) {
                return;
              }

              await sleep(runDelayMs);
            },
            onStepFinish: async (stepResult) => {
              await recordLtmStep(getUsageFromGenerateResult(stepResult));
            },
            onIterationComplete: async (iteration) => {
              forgeDebug({ scope: 'ltm', level: 'info', message: 'memory workflow step complete', context: {
                agentId: input.agentId,
                hasToolCalls: iteration.toolCalls.length > 0,
                outputLength: iteration.text.length,
                iteration: iteration.iteration,
              } });

              if (iteration.toolCalls.length > 0) {
                return {
                  continue: true,
                };
              }

              return {
                continue: false,
              };
            },
          }),
          GENERATE_TIMEOUT_MS,
          `LTM generate timed out for ${input.agentId}`,
          () => controller.abort(),
        );
        break;
      } catch (error) {
        forgeDebug({ scope: 'ltm', level: 'info', message: 'memory workflow attempt failed', context: {
          agentId: input.agentId,
          attempt,
          maxAttempts: GENERATE_MAX_ATTEMPTS,
          error: serializeError(error),
        } });

        if (attempt >= GENERATE_MAX_ATTEMPTS) {
          throw error;
        }

        await sleep(GENERATE_RETRY_BACKOFF_MS);
      } finally {
        currentAbortController = null;
      }
    }

    if (!result) {
      forgeDebug({ scope: 'ltm', level: 'error', message: 'generateLtmSummary: no result produced', context: { agentId: input.agentId } });
      throw new Error(`LTM generate produced no result for ${input.agentId}`);
    }

    return result;
  }

  async function runMemoryWorkflow() {
    if (stopped || !idle || running) {
      return;
    }

    clearTimer();
    const state = await readState();
    const availablePackages = state.packages ?? [];

    if (availablePackages.length === 0) {
      snapshot.queued = false;
      return;
    }

    running = true;
    snapshot.running = true;
    snapshot.queued = false;
    currentAbortController = new AbortController();
    const beforeSnapshot = await snapshotTrackedFiles(input.agentWorkspacePath);

    try {
      forgeDebug({ scope: 'ltm', level: 'info', message: 'memory workflow start', context: {
        agentId: input.agentId,
        packageIds: availablePackages.map((entry: any) => entry.packageId),
        packageCount: (state.packages ?? []).length,
      } });

      const changedFiles = new Set<string>();
      const nextState = await readState();

      if ((nextState.packages ?? []).length > 0) {
        await generateLtmRun(createMemoryAgentInstructions({ agentId: input.agentId, agentName: input.agentName, agentDescription: input.agentDescription, roleName: input.roleName, roleDescription: input.roleDescription, instructions: input.instructions }));
        const nowIso = new Date().toISOString();
        nextState.lastRunAt = nowIso;
        nextState.lastRunError = null;
        nextState.lastRunErrorAt = null;
        await writeState(nextState);
      }

      const afterSnapshot = await snapshotTrackedFiles(input.agentWorkspacePath);

      for (const filePath of diffTrackedFiles(beforeSnapshot, afterSnapshot)) {
        changedFiles.add(filePath);
      }

      forgeDebug({ scope: 'ltm', level: 'info', message: 'memory workflow complete', context: {
        agentId: input.agentId,
        packageIds: (state.packages ?? []).map((entry: any) => entry.packageId),
        changedFiles: Array.from(changedFiles).sort(),
      } });

      if (changedFiles.size > 0) {
        await markRecallIndexDirty('ltm-run-complete');
        await refreshRecallIndex?.();
      }
    } catch (error) {
      const nowIso = new Date().toISOString();

      state.lastRunAt = nowIso;
      state.lastRunError = serializeError(error);
      state.lastRunErrorAt = nowIso;
      await writeState(state);
      forgeDebug({ scope: 'ltm', level: 'info', message: 'memory workflow failed', context: {
        agentId: input.agentId,
        error: state.lastRunError,
      } });
    } finally {
      running = false;
      snapshot.running = false;
      currentAbortController = null;
    }
  }

  return {
    attachRecallIndexRefresh(handler: (() => Promise<void>) | null) {
      refreshRecallIndex = handler;
    },

    async start() {
      await ensureInitialized();
      const state = await readState();
      await writeState(state);
    },

    async onCheckpointAdvanced(payload: CheckpointedOmCheckpointPackageInput) {
       
   
  return await writeCheckpointPackage(payload);
    },

    async onAgentIdle() {
      idle = true;
      if (!stopped) snapshot.queued = true;
      if (!stopped) await scheduleRun(0);
    },

    onAgentRunning() {
      idle = false;
      clearTimer();
      snapshot.queued = false;
      currentAbortController?.abort(new Error('LTM run interrupted because main agent resumed running'));
    },

    getSnapshot() {
      return snapshot;
    },

    async readSnapshot() {
      const state = await readState();

      return {
        ...snapshot,
        lastRunAt: state.lastRunAt !== null && state.lastRunAt !== undefined ? Date.parse(String(state.lastRunAt)) : snapshot.lastRunAt,
        lastRunError: state.lastRunError,
        lastRunErrorAt: state.lastRunErrorAt !== null && state.lastRunErrorAt !== undefined ? Date.parse(String(state.lastRunErrorAt)) : null,
        lastWrittenPackageId: state.lastWrittenPackageId,
        lastWrittenAt: state.lastWrittenAt !== null && state.lastWrittenAt !== undefined ? Date.parse(String(state.lastWrittenAt)) : null,
        packageCount: (state.packages ?? []).length,
      };
    },

    async dispose() {
      stopped = true;
      clearTimer();
      currentAbortController?.abort(new Error('LTM disposed'));
      await memoryAgent?.dispose();
    },
  };
}

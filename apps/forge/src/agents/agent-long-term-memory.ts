import { createId } from '../utils/id';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  type CheckpointedOmCheckpointPackageInput,
  WorkspaceEmbedderId,
  createRuntimeAgentSession,
  forgeDebug,
  type ConversationStore,
  type RuntimeActionDefinition,
  toMastraSafeIdentifier,
} from '@forge-runtime/core';
import { z } from 'zod';

import {
  createAgentLongTermMemoryStore,
  type CheckpointPackageManifest,
  type LongTermMemoryState,
} from '../ltm/store';
import { createAgentContractStore } from './agent-contract-store';

import { withTimeout } from '../utils/async';
const CHECKPOINTS_DIR = 'checkpoints';
const MEMORY_DIR = 'memory';
const SKILLS_DIR = path.join('workspace', 'skills');
const GENERATE_TIMEOUT_MS = 5 * 60_000;
const GENERATE_MAX_ATTEMPTS = 2;
const GENERATE_RETRY_BACKOFF_MS = 10_000;
const GENERATE_MAX_STEPS_PER_RUN = 10_000;

type LtmUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

type LtmSnapshot = {
  running: boolean;
  queued: boolean;
  lastRunAt: number | null;
  lastRunError: string | null;
  lastRunErrorAt: number | null;
  lastWrittenPackageId: string | null;
  lastWrittenAt: number | null;
  packageCount: number;
};

function createMemoryAgentInstructions(input: {
  agentId: string;
  agentName: string;
  agentDescription?: string;
  roleName?: string;
  roleDescription?: string;
  instructions: string;
}) {
  return [
    `You are the long-term memory maintenance agent for ${input.agentName}.`,
    'You are not the main agent itself. You are the long-term memory layer of that agent: the part that consolidates, learns, restructures, and preserves what should remain useful over time.',
    'Your job is to maintain the durable memory of a specific agent. That memory must stay aligned with who that agent is, what role that agent has, and what kind of work belongs to that agent.',
    [
      '<owner_agent_profile>',
      `- Agent id: ${input.agentId}`,
      `- Agent name: ${input.agentName}`,
      input.agentDescription?.trim() ? `- Agent description: ${input.agentDescription.trim()}` : null,
      input.roleName?.trim() ? `- Role name: ${input.roleName.trim()}` : null,
      input.roleDescription?.trim() ? `- Role description: ${input.roleDescription.trim()}` : null,
      '- Assigned instructions:',
      input.instructions.trim(),
      '</owner_agent_profile>',
    ].filter(Boolean).join('\n'),
    'You are free to explore the workspace broadly and decide for yourself what deserves consolidation, restructuring, rewriting, splitting, merging, or expansion.',
    'Do not be lazy. Take as much time as needed for the activity, inspect things carefully, revisit relationships between documents, compare evidence from different places, and try better structures when the current one looks weak.',
    'You should not become passive or merely preserve what already exists. If the current memory base is weak, shallow, repetitive, badly named, badly structured, or missing useful connections, improve it.',
    'The directory `checkpoints` is not a place to edit. Treat it as unstable input: anything written there may be rewritten later and your changes there would be lost.',
    'Long-term memory is for durable knowledge, learning, connections, explanations, procedures, documentation, people knowledge, preferences, events, and inferences that remain useful over time.',
    'The main agent owns transient status and current execution state. Long-term memory should retain what stays useful after the temporary status is gone.',
    'Write clearly, discursively, and descriptively. These documents are later embedded and retrieved by similarity, so explicit language, context, names, and explanatory prose matter.',
    'Do not rely on tables, indexes, compressed summaries, or skeletal notes as the main body of memory. Prefer well-written explanatory text.',
    'Keep documents dense but bounded. Fragment them when needed. It is acceptable for different documents to overlap or repeat phrasing when that improves retrieval, but they must remain consistent with one another.',
    'If existing files are not aligned with these rules, refactor them. Rename, split, merge, rewrite, or replace them as needed.',
    'Do not infer totals or conclusions from truncated file listings. Inspect specific directories or files when you need complete evidence.',
    'Do not create files outside `memory` and `workspace/skills`.',
    'When repeated procedures justify a reusable skill, use the `skill-creator` skill to create or update it.',
    'A skill is only valid if the skill folder name matches the skill name declared inside its `SKILL.md` file.',
  ].filter(Boolean).join('\n\n');
}

function buildMemoryAgentPrompt() {
  return [
    'Explore the workspace actively and improve the long-term memory base of this agent.',
    'Inspect whatever evidence, documents, checkpoints, memories, and skills help you understand what should be consolidated, reorganized, connected, clarified, or expanded.',
    'Do not follow a lazy maintenance loop. Revisit existing material, try different structures, discover missing connections, compare documents against one another, and improve weak or fragmented knowledge when you see it.',
    'Think of this as an offline consolidation phase: review experience, revisit old notes, compare them with new evidence, strengthen useful abstractions, and preserve better long-term structure.',
    'Prefer durable, descriptive, retrieval-friendly documents and reusable skills when repeated procedures justify them.',
    'Use the `skill-creator` skill when you decide a reusable skill should be created or updated.',
    'A skill is only valid when the directory name matches the skill name declared in its `SKILL.md`.',
    'Do not write status documents, progress snapshots, current-state summaries, or temporary backlog trackers.',
    `Do not edit \`${CHECKPOINTS_DIR}\`. That area may be rewritten later and anything changed there can be lost.`,
    'Write clearly, explain things well, and keep information consistent across files even when some overlap or repetition is helpful for retrieval.',
    'When you finish a maintenance pass, do not spend output tokens on maintenance report tables. Only communicate the minimum necessary outcome.',
  ].join('\n');
}

function getUsageFromGenerateResult(result: { usage?: unknown }): LtmUsage {
  const usage = result.usage as {
    inputTokens?: number;
    outputTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    cachedInputTokens?: number;
    inputTokenDetails?: {
      noCacheTokens?: number;
      cacheReadTokens?: number;
    };
  };
  const cachedInputTokens =
    usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens ?? 0;
  const promptTokens = usage.inputTokens ?? usage.promptTokens ?? 0;

  return {
    inputTokens: promptTokens,
    cachedInputTokens,
    outputTokens: usage.outputTokens ?? usage.completionTokens ?? 0,
  };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}


async function listRelativeFiles(rootPath: string, relativeRoot: string) {
  const absoluteRoot = path.resolve(rootPath, relativeRoot);
  let exists = false;
  try {
    await fs.access(absoluteRoot);
    exists = true;
  } catch (err) {
    forgeDebug({ scope: 'agent-long-term-memory', level: 'error', message: '[safe-catch] access check', context: { error: err } });
  }

  if (!exists) {
    return [];
  }

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

function renderCheckpointPackageReadme(input: {
  payload: CheckpointedOmCheckpointPackageInput;
}) {
  return [
    input.payload.checkpointSummary.text.trim(),
    '',
  ].join('\n');
}

function renderReflectionFile(reflection: CheckpointedOmCheckpointPackageInput['reflections'][number]) {
  return [
    '---',
    `createdAt: ${reflection.createdAt}`,
    '---',
    '',
    reflection.text.trim(),
    '',
  ].join('\n');
}

function renderObservationFile(observation: CheckpointedOmCheckpointPackageInput['observations'][number]) {
  return [
    '---',
    `createdAt: ${observation.createdAt}`,
    '---',
    '',
    observation.text.trim(),
    '',
  ].join('\n');
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
  persistenceStore: ReturnType<typeof createAgentLongTermMemoryStore>;
}) {
  const checkpointsPath = path.resolve(input.agentMemoryPath, CHECKPOINTS_DIR);
  const memoryPath = path.resolve(input.agentMemoryPath, MEMORY_DIR);
  const ltmMastraId = toMastraSafeIdentifier(`${input.agentId}_long_term_memory`);
  let memoryAgent: Awaited<ReturnType<typeof createRuntimeAgentSession>> | null = null;

  let initialized = false;
  let idle = false;
  let running = false;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let currentAbortController: AbortController | null = null;
  let refreshRecallIndex: (() => Promise<void>) | null = null;
  let snapshot: LtmSnapshot = {
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
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    timer = null;
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
    return input.persistenceStore.readState();
  }

  async function writeState(state: LongTermMemoryState) {
    await ensureInitialized();
    const persistedState = await input.persistenceStore.writeState(state);
    snapshot = {
      ...snapshot,
      lastRunAt: persistedState.lastRunAt ? Date.parse(persistedState.lastRunAt) : snapshot.lastRunAt,
      lastRunError: persistedState.lastRunError,
      lastRunErrorAt: persistedState.lastRunErrorAt ? Date.parse(persistedState.lastRunErrorAt) : null,
      lastWrittenPackageId: persistedState.lastWrittenPackageId,
      lastWrittenAt: persistedState.lastWrittenAt ? Date.parse(persistedState.lastWrittenAt) : null,
      packageCount: persistedState.packages.length,
    };
  }

  async function markRecallIndexDirty(reason: string) {
    await ensureInitialized();
    await input.persistenceStore.writeRecallIndexStamp(reason);
  }

  function scheduleRun(delayMs: number) {
    if (stopped || !idle) {
      return;
    }

    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void runMemoryWorkflow();
    }, delayMs);
  }

  async function writeCheckpointPackage(payload: CheckpointedOmCheckpointPackageInput) {
    const state = await readState();
    const existing = state.packages.find((entry) => entry.checkpointGeneration === payload.toGeneration);

    if (existing) {
      return existing;
    }

    // Bugfix #1098: checkpoint timestamp must be the oldest reflection's createdAt,
    // not the current summary.updatedAt. This ensures the checkpoint preserves the
    // temporal ordering of the replaced block.
    const allCreatedAts = [
      ...payload.reflections.map(r => r.createdAt),
      ...payload.observations.map(o => o.createdAt),
    ];
    const checkpointTimestamp = allCreatedAts.length > 0
      ? allCreatedAts.reduce((earliest, ts) => ts < earliest ? ts : earliest, allCreatedAts[0])
      : payload.checkpointSummary.updatedAt;

    const dayKey = checkpointTimestamp.slice(0, 10);
    const sequence = state.packages
      .filter((entry) => entry.packageId.startsWith(`${dayKey}_`))
      .length + 1;
    const packageId = `${dayKey}_${String(sequence).padStart(3, '0')}`;
    const packagePath = path.resolve(checkpointsPath, packageId);
    const tempPackagePath = `${packagePath}.${createId()}.tmp`;

    forgeDebug({ scope: 'ltm', level: 'info', message: 'checkpoint package write start', context: {
      agentId: input.agentId,
      threadId: payload.threadId,
      packageId,
      checkpointGeneration: payload.toGeneration,
      reflectionCount: payload.reflections.length,
      observationCount: payload.observations.length,
    } });

    await fs.rm(tempPackagePath, { recursive: true, force: true });
    await fs.mkdir(tempPackagePath, { recursive: true });
    await fs.writeFile(
      path.resolve(tempPackagePath, 'README.md'),
      renderCheckpointPackageReadme({
        payload,
      }),
    );

    if (payload.reflections.length > 0) {
      await fs.mkdir(path.resolve(tempPackagePath, 'reflections'), { recursive: true });
    }

    for (const [index, reflection] of payload.reflections.entries()) {
      await fs.writeFile(
        path.resolve(tempPackagePath, 'reflections', `reflection_${String(index + 1).padStart(3, '0')}.md`),
        renderReflectionFile(reflection),
      );
    }

    if (payload.observations.length > 0) {
      await fs.mkdir(path.resolve(tempPackagePath, 'observations'), { recursive: true });
    }

    for (const [index, observation] of payload.observations.entries()) {
      await fs.writeFile(
        path.resolve(tempPackagePath, 'observations', `observation_${String(index + 1).padStart(4, '0')}.md`),
        renderObservationFile(observation),
      );
    }

    await fs.rm(packagePath, { recursive: true, force: true });
    await fs.rename(tempPackagePath, packagePath);

    const manifest: CheckpointPackageManifest = {
      packageId,
      checkpointGeneration: payload.toGeneration,
      fromGeneration: payload.fromGeneration,
      toGeneration: payload.toGeneration,
      createdAt: checkpointTimestamp,
      checkpointSummaryUpdatedAt: checkpointTimestamp,
      reflectionCount: payload.reflections.length,
      observationCount: payload.observations.length,
    };

    state.packages.push(manifest);
    state.lastWrittenPackageId = packageId;
    state.lastWrittenAt = checkpointTimestamp;
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
    if (!input.modelProfileId) {
      return;
    }

    const contract = await input.contractStore.getRunnableContract(input.agentId);

    if (!contract) {
      return;
    }

    const pricing = await input.contractStore.getUsagePricing({
      pricingModelKey: input.pricingModelKey,
      profileId: input.modelProfileId,
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
      llmProfileId: input.modelProfileId,
      modelKey: input.pricingModelKey,
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

    if (!contract || !input.modelProfileId) {
      return 0;
    }

    const pricing = await input.contractStore.getUsagePricing({
      pricingModelKey: input.pricingModelKey,
      profileId: input.modelProfileId,
    });

    const recentSteps = await input.contractStore.listRecentSteps(input.agentId, 10);

    if (recentSteps.length === 0 || !pricing.modelPrice) {
      return 0;
    }

    const averageInputTokens =
      recentSteps.reduce((total, step) => total + step.inputTokens, 0) / recentSteps.length;
    const averageCachedInputTokens =
      recentSteps.reduce((total, step) => total + step.cachedInputTokens, 0) / recentSteps.length;
    const averageOutputTokens =
      recentSteps.reduce((total, step) => total + step.outputTokens, 0) / recentSteps.length;
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
      forgeDebug({ scope: 'agent-long-term-memory', level: 'warn', message: 'initializeLtmSession: runtime not available', context: { agentId: input.agentId } });
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
          error: error instanceof Error ? error.message : String(error),
        } });

        if (attempt >= GENERATE_MAX_ATTEMPTS) {
          forgeDebug({ scope: 'agent-long-term-memory', level: 'error', message: 'agent-long-term-memory operation failed', error: error instanceof Error ? error.message : String(error) });
          throw error;
        }

        await sleep(GENERATE_RETRY_BACKOFF_MS);
      } finally {
        currentAbortController = null;
      }
    }

    if (!result) {
      forgeDebug({ scope: 'agent-long-term-memory', level: 'error', message: 'generateLtmSummary: no result produced', context: { agentId: input.agentId } });
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
    const availablePackages = state.packages;

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
        packageIds: availablePackages.map((entry) => entry.packageId),
        packageCount: state.packages.length,
      } });

      const changedFiles = new Set<string>();
      const nextState = await readState();

      if (nextState.packages.length > 0) {
        await generateLtmRun(buildMemoryAgentPrompt());
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
        packageIds: state.packages.map((entry) => entry.packageId),
        changedFiles: Array.from(changedFiles).sort(),
      } });

      if (changedFiles.size > 0) {
        await markRecallIndexDirty('ltm-run-complete');
        await refreshRecallIndex?.();
      }
    } catch (error) {
      const nowIso = new Date().toISOString();

      state.lastRunAt = nowIso;
      state.lastRunError = error instanceof Error ? error.message : String(error);
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
      return writeCheckpointPackage(payload);
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
        lastRunAt: state.lastRunAt ? Date.parse(state.lastRunAt) : snapshot.lastRunAt,
        lastRunError: state.lastRunError,
        lastRunErrorAt: state.lastRunErrorAt ? Date.parse(state.lastRunErrorAt) : null,
        lastWrittenPackageId: state.lastWrittenPackageId,
        lastWrittenAt: state.lastWrittenAt ? Date.parse(state.lastWrittenAt) : null,
        packageCount: state.packages.length,
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

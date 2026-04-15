import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { Agent, type AgentConfig } from '@mastra/core/agent';
import { LocalFilesystem, Workspace as WorkspaceRuntime } from '@mastra/core/workspace';
import type {
  CheckpointedOmCheckpointPackageInput,
} from '@mastra-engine/core';
import { forgeDebug, toMastraSafeIdentifier } from '@mastra-engine/core';
import { z } from 'zod';

import { createAgentContractStore } from './agent-contract-store';

const LTM_STATE_FILE = '.ltm-state.json';
const CHECKPOINTS_DIR = 'checkpoints';
const MEMORY_DIR = 'memory';
const SKILLS_DIR = path.join('workspace', 'skills');
const IDLE_PERIODIC_RUN_MS = 15 * 60_000;
const GENERATE_TIMEOUT_MS = 5 * 60_000;
const GENERATE_MAX_ATTEMPTS = 2;
const GENERATE_RETRY_BACKOFF_MS = 10_000;
const MAX_MEMORY_AGENT_STEPS = 120;

const packageManifestSchema = z.object({
  packageId: z.string().min(1),
  checkpointGeneration: z.number().int().nonnegative(),
  fromGeneration: z.number().int().nonnegative().nullable(),
  toGeneration: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  checkpointSummaryUpdatedAt: z.string().min(1),
  reflectionCount: z.number().int().nonnegative(),
  observationCount: z.number().int().nonnegative(),
  processedAt: z.string().min(1).nullable(),
});

const ltmStateSchema = z.object({
  version: z.literal(1),
  packages: z.array(packageManifestSchema),
  lastWrittenPackageId: z.string().min(1).nullable(),
  lastWrittenAt: z.string().min(1).nullable(),
  lastProcessedPackageId: z.string().min(1).nullable(),
  lastProcessedAt: z.string().min(1).nullable(),
  lastRunAt: z.string().min(1).nullable(),
  lastRunError: z.string().min(1).nullable(),
  lastRunErrorAt: z.string().min(1).nullable(),
  updatedAt: z.string().min(1),
});

type LongTermMemoryState = z.infer<typeof ltmStateSchema>;
type CheckpointPackageManifest = z.infer<typeof packageManifestSchema>;

type LtmUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

type LtmSnapshot = {
  running: boolean;
  queued: boolean;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastRunError: string | null;
  lastRunErrorAt: number | null;
  lastWrittenPackageId: string | null;
  lastWrittenAt: number | null;
  lastProcessedPackageId: string | null;
  lastProcessedAt: number | null;
  pendingPackageCount: number;
  writtenPackageCount: number;
  processedPackageCount: number;
};

function createEmptyLongTermMemoryState(): LongTermMemoryState {
  const now = new Date().toISOString();

  return {
    version: 1,
    packages: [],
    lastWrittenPackageId: null,
    lastWrittenAt: null,
    lastProcessedPackageId: null,
    lastProcessedAt: null,
    lastRunAt: null,
    lastRunError: null,
    lastRunErrorAt: null,
    updatedAt: now,
  };
}

function createMemoryAgentInstructions(input: {
  agentName: string;
  mainAgentSystemPrompt?: string;
}) {
  return [
    `You are the long-term memory maintenance agent for ${input.agentName}.`,
    'You work asynchronously over checkpoint packages and durable memory documents.',
    'Never modify anything inside `workspace-memory/checkpoints`.',
    'Read new checkpoint packages, consolidate durable knowledge, and maintain documents under `workspace-memory/memory`.',
    'You may also create or update reusable skills under `workspace/skills` when repeated evidence justifies durable operational instructions, scripts, or workflows.',
    'Prefer focused documents over one oversized file. Rewrite stale material when newer evidence supersedes it.',
    'Keep checkpoint packages immutable. Put maintained knowledge in `workspace-memory/memory` and reusable procedural assets in `workspace/skills`.',
    'Use workspace-relative paths. The relevant roots are:',
    `- \`${path.posix.join('workspace-memory', CHECKPOINTS_DIR)}\``,
    `- \`${path.posix.join('workspace-memory', MEMORY_DIR)}\``,
    `- \`${SKILLS_DIR.replace(/\\/g, '/')}\``,
    input.mainAgentSystemPrompt?.trim()
      ? [
          '<main_agent_system_prompt>',
          'Use this as alignment context so the maintained memory and skills stay aligned with the main agent role.',
          input.mainAgentSystemPrompt.trim(),
          '</main_agent_system_prompt>',
        ].join('\n')
      : '',
  ].filter(Boolean).join('\n\n');
}

function buildMemoryAgentPrompt(packages: CheckpointPackageManifest[]) {
  return [
    'Process every pending checkpoint package listed below.',
    'Read each package summary first, then inspect reflections and observations only when useful.',
    'Update or create durable knowledge documents under `workspace-memory/memory`.',
    'Create or improve files under `workspace/skills` only when the evidence supports a reusable operational skill.',
    'Do not edit checkpoint packages.',
    '',
    '<pending_packages>',
    ...packages.map((entry) => [
      `- packageId: ${entry.packageId}`,
      `  checkpointGeneration: ${entry.checkpointGeneration}`,
      `  path: workspace-memory/checkpoints/${entry.packageId}`,
    ].join('\n')),
    '</pending_packages>',
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

  return {
    inputTokens: usage.inputTokenDetails?.noCacheTokens ?? usage.inputTokens ?? usage.promptTokens ?? 0,
    cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens ?? 0,
    outputTokens: usage.outputTokens ?? usage.completionTokens ?? 0,
  };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
) {
  let timer: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function listRelativeFiles(rootPath: string, relativeRoot: string) {
  const absoluteRoot = path.resolve(rootPath, relativeRoot);
  const exists = await fs.access(absoluteRoot).then(() => true).catch(() => false);

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
    ...await listRelativeFiles(agentWorkspacePath, path.posix.join('workspace-memory', MEMORY_DIR)),
    ...await listRelativeFiles(agentWorkspacePath, SKILLS_DIR.replace(/\\/g, '/')),
  ];
  const snapshot = new Map<string, string>();

  for (const relativePath of filePaths) {
    const absolutePath = path.resolve(agentWorkspacePath, relativePath);
    const content = await fs.readFile(absolutePath, 'utf8').catch(() => '');
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
  agentId: string;
  threadId: string;
  packageId: string;
  payload: CheckpointedOmCheckpointPackageInput;
}) {
  return [
    '---',
    `agentId: ${input.agentId}`,
    `threadId: ${input.threadId}`,
    `packageId: ${input.packageId}`,
    `checkpointGeneration: ${input.payload.toGeneration}`,
    `fromGeneration: ${input.payload.fromGeneration ?? 'null'}`,
    `toGeneration: ${input.payload.toGeneration}`,
    `createdAt: ${input.payload.checkpointSummary.updatedAt}`,
    `reflectionCount: ${input.payload.reflections.length}`,
    `observationCount: ${input.payload.observations.length}`,
    '---',
    '',
    input.payload.checkpointSummary.text.trim(),
    '',
  ].join('\n');
}

function renderReflectionFile(reflection: CheckpointedOmCheckpointPackageInput['reflections'][number]) {
  return [
    '---',
    `recordId: ${reflection.recordId}`,
    `generationCount: ${reflection.generationCount}`,
    `createdAt: ${reflection.createdAt}`,
    `tokenCount: ${reflection.tokenCount}`,
    '---',
    '',
    reflection.text.trim(),
    '',
  ].join('\n');
}

function renderObservationFile(observation: CheckpointedOmCheckpointPackageInput['observations'][number]) {
  return [
    '---',
    `blockId: ${observation.blockId}`,
    `reflectedGeneration: ${observation.reflectedGeneration}`,
    `createdAt: ${observation.createdAt}`,
    `lastObservedAt: ${observation.lastObservedAt}`,
    `tokenCount: ${observation.tokenCount}`,
    '---',
    '',
    observation.text.trim(),
    '',
  ].join('\n');
}

export function createAgentLongTermMemory(input: {
  agentId: string;
  agentName: string;
  agentWorkspacePath: string;
  agentMemoryPath: string;
  model: AgentConfig['model'];
  pricingModelKey: string;
  modelProfileId?: string;
  mainAgentSystemPrompt?: string;
  contractStore: ReturnType<typeof createAgentContractStore>;
}) {
  const checkpointsPath = path.resolve(input.agentMemoryPath, CHECKPOINTS_DIR);
  const memoryPath = path.resolve(input.agentMemoryPath, MEMORY_DIR);
  const statePath = path.resolve(input.agentMemoryPath, LTM_STATE_FILE);
  const workspace = new WorkspaceRuntime({
    autoSync: true,
    filesystem: new LocalFilesystem({
      basePath: input.agentWorkspacePath,
    }),
    skills: ['workspace/skills/**/SKILL.md'],
  });
  const memoryAgent = new Agent({
    id: toMastraSafeIdentifier(`${input.agentId}_long_term_memory`),
    name: `${input.agentName} Long-Term Memory`,
    instructions: createMemoryAgentInstructions({
      agentName: input.agentName,
      mainAgentSystemPrompt: input.mainAgentSystemPrompt,
    }),
    model: input.model,
    workspace,
  });

  let initialized = false;
  let idle = false;
  let running = false;
  let stopped = false;
  let nextRunAt: number | null = null;
  let timer: NodeJS.Timeout | null = null;
  let currentAbortController: AbortController | null = null;
  let snapshot: LtmSnapshot = {
    running: false,
    queued: false,
    nextRunAt: null,
    lastRunAt: null,
    lastRunError: null,
    lastRunErrorAt: null,
    lastWrittenPackageId: null,
    lastWrittenAt: null,
    lastProcessedPackageId: null,
    lastProcessedAt: null,
    pendingPackageCount: 0,
    writtenPackageCount: 0,
    processedPackageCount: 0,
  };

  function clearTimer() {
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    timer = null;
    nextRunAt = null;
    snapshot.nextRunAt = null;
  }

  async function ensureInitialized() {
    if (initialized) {
      return;
    }

    await fs.mkdir(checkpointsPath, { recursive: true });
    await fs.mkdir(memoryPath, { recursive: true });
    await workspace.init();
    initialized = true;
  }

  async function readState() {
    await ensureInitialized();
    const raw = await fs.readFile(statePath, 'utf8').catch(() => null);

    if (!raw) {
      const state = createEmptyLongTermMemoryState();
      await writeState(state);
      return state;
    }

    const parsed = ltmStateSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      const state = createEmptyLongTermMemoryState();
      await writeState(state);
      return state;
    }

    return parsed.data;
  }

  async function writeState(state: LongTermMemoryState) {
    await ensureInitialized();
    state.updatedAt = new Date().toISOString();
    const tempPath = `${statePath}.${randomUUID()}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(state, null, 2));
    await fs.rename(tempPath, statePath);
    snapshot = {
      ...snapshot,
      lastRunAt: state.lastRunAt ? Date.parse(state.lastRunAt) : snapshot.lastRunAt,
      lastRunError: state.lastRunError,
      lastRunErrorAt: state.lastRunErrorAt ? Date.parse(state.lastRunErrorAt) : null,
      lastWrittenPackageId: state.lastWrittenPackageId,
      lastWrittenAt: state.lastWrittenAt ? Date.parse(state.lastWrittenAt) : null,
      lastProcessedPackageId: state.lastProcessedPackageId,
      lastProcessedAt: state.lastProcessedAt ? Date.parse(state.lastProcessedAt) : null,
      pendingPackageCount: state.packages.filter((entry) => entry.processedAt === null).length,
      writtenPackageCount: state.packages.length,
      processedPackageCount: state.packages.filter((entry) => entry.processedAt !== null).length,
    };
  }

  async function scheduleRun(delayMs: number) {
    if (stopped || !idle) {
      return;
    }

    clearTimer();
    nextRunAt = Date.now() + delayMs;
    snapshot.nextRunAt = nextRunAt;
    timer = setTimeout(() => {
      timer = null;
      nextRunAt = null;
      snapshot.nextRunAt = null;
      void runPendingPackages();
    }, delayMs);
  }

  async function writeCheckpointPackage(payload: CheckpointedOmCheckpointPackageInput) {
    const state = await readState();
    const existing = state.packages.find((entry) => entry.checkpointGeneration === payload.toGeneration);

    if (existing) {
      return existing;
    }

    const dayKey = payload.checkpointSummary.updatedAt.slice(0, 10);
    const sequence = state.packages
      .filter((entry) => entry.packageId.startsWith(`${dayKey}_`))
      .length + 1;
    const packageId = `${dayKey}_${String(sequence).padStart(3, '0')}`;
    const packagePath = path.resolve(checkpointsPath, packageId);
    const tempPackagePath = `${packagePath}.${randomUUID()}.tmp`;

    forgeDebug('ltm', 'checkpoint package write start', {
      agentId: input.agentId,
      threadId: payload.threadId,
      packageId,
      checkpointGeneration: payload.toGeneration,
      reflectionCount: payload.reflections.length,
      observationCount: payload.observations.length,
    });

    await fs.rm(tempPackagePath, { recursive: true, force: true });
    await fs.mkdir(path.resolve(tempPackagePath, 'reflections'), { recursive: true });
    await fs.mkdir(path.resolve(tempPackagePath, 'observations'), { recursive: true });
    await fs.writeFile(
      path.resolve(tempPackagePath, 'README.md'),
      renderCheckpointPackageReadme({
        agentId: input.agentId,
        threadId: payload.threadId,
        packageId,
        payload,
      }),
    );

    for (const [index, reflection] of payload.reflections.entries()) {
      await fs.writeFile(
        path.resolve(tempPackagePath, 'reflections', `reflection_${String(index + 1).padStart(3, '0')}.md`),
        renderReflectionFile(reflection),
      );
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
      createdAt: payload.checkpointSummary.updatedAt,
      checkpointSummaryUpdatedAt: payload.checkpointSummary.updatedAt,
      reflectionCount: payload.reflections.length,
      observationCount: payload.observations.length,
      processedAt: null,
    };

    state.packages.push(manifest);
    state.lastWrittenPackageId = packageId;
    state.lastWrittenAt = payload.checkpointSummary.updatedAt;
    state.lastRunError = null;
    state.lastRunErrorAt = null;
    await writeState(state);

    forgeDebug('ltm', 'checkpoint package write complete', {
      agentId: input.agentId,
      threadId: payload.threadId,
      packageId,
      checkpointGeneration: payload.toGeneration,
    });

    if (idle) {
      snapshot.queued = true;
      await scheduleRun(0);
    }

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
      costUsd =
        ((usage.inputTokens / 1_000_000) * pricing.modelPrice.inputPerMillionUsd
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

  async function runPendingPackages() {
    if (stopped || !idle || running) {
      return;
    }

    clearTimer();
    const state = await readState();
    const pendingPackages = state.packages.filter((entry) => entry.processedAt === null);

    if (pendingPackages.length === 0) {
      snapshot.queued = false;
      await scheduleRun(IDLE_PERIODIC_RUN_MS);
      return;
    }

    running = true;
    snapshot.running = true;
    snapshot.queued = false;
    currentAbortController = new AbortController();
    const beforeSnapshot = await snapshotTrackedFiles(input.agentWorkspacePath);

    try {
      forgeDebug('ltm', 'memory workflow start', {
        agentId: input.agentId,
        packageIds: pendingPackages.map((entry) => entry.packageId),
        pendingPackageCount: pendingPackages.length,
      });

      let result: Awaited<ReturnType<typeof memoryAgent.generate>> | null = null;

      for (let attempt = 1; attempt <= GENERATE_MAX_ATTEMPTS; attempt += 1) {
        try {
          result = await withTimeout(
            memoryAgent.generate(buildMemoryAgentPrompt(pendingPackages), {
              maxSteps: MAX_MEMORY_AGENT_STEPS,
              abortSignal: currentAbortController.signal,
            }),
            GENERATE_TIMEOUT_MS,
            `LTM generate timed out for ${input.agentId}`,
            () => currentAbortController?.abort(),
          );
          break;
        } catch (error) {
          forgeDebug('ltm', 'memory workflow attempt failed', {
            agentId: input.agentId,
            attempt,
            maxAttempts: GENERATE_MAX_ATTEMPTS,
            error: error instanceof Error ? error.message : String(error),
          });

          if (attempt >= GENERATE_MAX_ATTEMPTS) {
            throw error;
          }

          await sleep(GENERATE_RETRY_BACKOFF_MS);
        }
      }

      if (!result) {
        throw new Error(`LTM generate produced no result for ${input.agentId}`);
      }

      const afterSnapshot = await snapshotTrackedFiles(input.agentWorkspacePath);
      const changedFiles = diffTrackedFiles(beforeSnapshot, afterSnapshot);
      const nowIso = new Date().toISOString();

      for (const pendingPackage of pendingPackages) {
        pendingPackage.processedAt = nowIso;
      }

      state.lastProcessedPackageId = pendingPackages.at(-1)?.packageId ?? state.lastProcessedPackageId;
      state.lastProcessedAt = nowIso;
      state.lastRunAt = nowIso;
      state.lastRunError = null;
      state.lastRunErrorAt = null;
      await writeState(state);
      await recordLtmStep(getUsageFromGenerateResult(result));

      forgeDebug('ltm', 'memory workflow complete', {
        agentId: input.agentId,
        processedPackageIds: pendingPackages.map((entry) => entry.packageId),
        changedFiles,
      });
    } catch (error) {
      const nowIso = new Date().toISOString();

      state.lastRunAt = nowIso;
      state.lastRunError = error instanceof Error ? error.message : String(error);
      state.lastRunErrorAt = nowIso;
      await writeState(state);
      forgeDebug('ltm', 'memory workflow failed', {
        agentId: input.agentId,
        error: state.lastRunError,
      });
    } finally {
      running = false;
      snapshot.running = false;
      currentAbortController = null;

      if (!stopped && idle) {
        await scheduleRun(IDLE_PERIODIC_RUN_MS);
      }
    }
  }

  return {
    async start() {
      await ensureInitialized();
      const state = await readState();
      await writeState(state);
    },

    async onCheckpointAdvanced(payload: CheckpointedOmCheckpointPackageInput) {
      await writeCheckpointPackage(payload);
    },

    async onAgentIdle() {
      idle = true;
      snapshot.queued = true;
      await scheduleRun(0);
    },

    onAgentRunning() {
      idle = false;
      clearTimer();
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
        lastProcessedPackageId: state.lastProcessedPackageId,
        lastProcessedAt: state.lastProcessedAt ? Date.parse(state.lastProcessedAt) : null,
        pendingPackageCount: state.packages.filter((entry) => entry.processedAt === null).length,
        writtenPackageCount: state.packages.length,
        processedPackageCount: state.packages.filter((entry) => entry.processedAt !== null).length,
      };
    },

    async dispose() {
      stopped = true;
      clearTimer();
      currentAbortController?.abort(new Error('LTM disposed'));
    },
  };
}

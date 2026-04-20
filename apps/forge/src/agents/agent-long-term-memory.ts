import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { Agent, type AgentConfig } from '@mastra/core/agent';
import { LocalFilesystem, Workspace as WorkspaceRuntime } from '@mastra/core/workspace';
import type { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import type {
  CheckpointedOmCheckpointPackageInput,
  CheckpointedOmArchivedObservation,
  CheckpointedOmArchivedReflection,
  WorkspaceEmbedderId,
} from '@mastra-engine/core';
import { createAgentMemory, forgeDebug, toMastraSafeIdentifier } from '@mastra-engine/core';
import { z } from 'zod';

import { createAgentContractStore } from './agent-contract-store';

const LTM_STATE_FILE = '.ltm-state.json';
const LTM_RECALL_INDEX_STAMP_FILE = '.ltm-recall-index-stamp.json';
const CHECKPOINTS_DIR = 'checkpoints';
const MEMORY_DIR = 'memory';
const SKILLS_DIR = path.join('workspace', 'skills');
const GENERATE_TIMEOUT_MS = 5 * 60_000;
const GENERATE_MAX_ATTEMPTS = 2;
const GENERATE_RETRY_BACKOFF_MS = 10_000;
const GENERATE_MAX_STEPS_PER_RUN = 10_000;
const INITIAL_RUN_LAST_MESSAGES = 10;

const packageManifestSchema = z.object({
  packageId: z.string().min(1),
  checkpointGeneration: z.number().int().nonnegative(),
  fromGeneration: z.number().int().nonnegative().nullable(),
  toGeneration: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  checkpointSummaryUpdatedAt: z.string().min(1),
  reflectionCount: z.number().int().nonnegative(),
  observationCount: z.number().int().nonnegative(),
});

const ltmStateSchema = z.object({
  version: z.literal(1),
  packages: z.array(packageManifestSchema),
  lastWrittenPackageId: z.string().min(1).nullable(),
  lastWrittenAt: z.string().min(1).nullable(),
  lastRunAt: z.string().min(1).nullable(),
  lastRunError: z.string().min(1).nullable(),
  lastRunErrorAt: z.string().min(1).nullable(),
  updatedAt: z.string().min(1),
});

type LongTermMemoryState = z.infer<typeof ltmStateSchema>;
type CheckpointPackageManifest = z.infer<typeof packageManifestSchema>;

type StorageThread = {
  metadata?: Record<string, unknown>;
};

type ObservationalMemoryRecord = {
  id: string;
  generationCount: number;
  activeObservations: string;
  createdAt: Date;
};

type CustomCheckpointSummary = {
  text: string;
  tokenCount: number;
  upToGeneration: number;
  updatedAt: string;
};

type CustomObservationBlock = {
  id: string;
  text: string;
  tokenCount: number;
  createdAt: string;
  lastObservedAt: string;
  reflectedGeneration: number | null;
};

type CustomCheckpointedContextState = {
  checkpointGeneration: number | null;
  checkpointSummary: CustomCheckpointSummary | null;
  observationBlocks: CustomObservationBlock[];
};

type MemoryStoreWithObservationalMemory = NonNullable<LibSQLStore['stores']['memory']> & {
  getThreadById(input: { threadId: string }): Promise<StorageThread | null>;
  getObservationalMemoryHistory(
    threadId: string | null,
    resourceId: string,
    limit?: number,
  ): Promise<ObservationalMemoryRecord[]>;
};

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

function createEmptyLongTermMemoryState(): LongTermMemoryState {
  const now = new Date().toISOString();

  return {
    version: 1,
    packages: [],
    lastWrittenPackageId: null,
    lastWrittenAt: null,
    lastRunAt: null,
    lastRunError: null,
    lastRunErrorAt: null,
    updatedAt: now,
  };
}

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
    ...await listRelativeFiles(agentWorkspacePath, path.posix.join('workspace', 'memory', MEMORY_DIR)),
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

function hasObservationalMemoryAccess(
  store: NonNullable<LibSQLStore['stores']['memory']>,
): store is MemoryStoreWithObservationalMemory {
  return (
    typeof store === 'object' &&
    store !== null &&
    'getThreadById' in store &&
    typeof store.getThreadById === 'function' &&
    'getObservationalMemoryHistory' in store &&
    typeof store.getObservationalMemoryHistory === 'function'
  );
}

function getCustomCheckpointedContextState(metadata: Record<string, unknown> | undefined) {
  const rawMastra = metadata?.mastra;
  const rawOm = rawMastra && typeof rawMastra === 'object'
    ? (rawMastra as { om?: Record<string, unknown> }).om
    : undefined;
  const custom = rawOm?.customCheckpointedContext;

  if (!custom || typeof custom !== 'object') {
    return null;
  }

  const value = custom as Partial<CustomCheckpointedContextState>;
  return {
    checkpointGeneration:
      typeof value.checkpointGeneration === 'number' ? value.checkpointGeneration : null,
    checkpointSummary:
      value.checkpointSummary && typeof value.checkpointSummary === 'object'
        ? value.checkpointSummary as CustomCheckpointSummary
        : null,
    observationBlocks: Array.isArray(value.observationBlocks) ? value.observationBlocks : [],
  };
}

function buildBootstrapCheckpointPackage(input: {
  threadId: string;
  resourceId: string;
  checkpointGeneration: number;
  checkpointSummary: CustomCheckpointSummary;
  reflectionRecords: ObservationalMemoryRecord[];
  observationBlocks: CustomObservationBlock[];
}): CheckpointedOmCheckpointPackageInput {
  const reflections: CheckpointedOmArchivedReflection[] = input.reflectionRecords
    .filter((record) => record.generationCount <= input.checkpointGeneration)
    .map((record) => ({
      recordId: record.id,
      generationCount: record.generationCount,
      tokenCount: 0,
      createdAt: record.createdAt.toISOString(),
      text: record.activeObservations,
    }));
  const observations: CheckpointedOmArchivedObservation[] = input.observationBlocks
    .filter((block) =>
      typeof block.reflectedGeneration === 'number' &&
      block.reflectedGeneration <= input.checkpointGeneration,
    )
    .map((block) => ({
      blockId: block.id,
      tokenCount: block.tokenCount,
      createdAt: block.createdAt,
      lastObservedAt: block.lastObservedAt,
      reflectedGeneration: block.reflectedGeneration as number,
      text: block.text,
    }));

  return {
    threadId: input.threadId,
    resourceId: input.resourceId,
    fromGeneration: null,
    toGeneration: input.checkpointGeneration,
    checkpointSummary: input.checkpointSummary,
    reflections,
    observations,
  };
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
  storage: LibSQLStore;
  vector: LibSQLVector;
  threadId: string;
  resourceId: string;
  model: AgentConfig['model'];
  pricingModelKey: string;
  modelProfileId?: string;
  contractStore: ReturnType<typeof createAgentContractStore>;
  workspaceEmbedder?: WorkspaceEmbedderId;
}) {
  const checkpointsPath = path.resolve(input.agentMemoryPath, CHECKPOINTS_DIR);
  const memoryPath = path.resolve(input.agentMemoryPath, MEMORY_DIR);
  const statePath = path.resolve(input.agentMemoryPath, LTM_STATE_FILE);
  const ltmMastraId = toMastraSafeIdentifier(`${input.agentId}_long_term_memory`);
  const workspace = new WorkspaceRuntime({
    autoSync: false,
    filesystem: new LocalFilesystem({
      basePath: input.agentMemoryPath,
      allowedPaths: [path.resolve(input.agentWorkspacePath, SKILLS_DIR)],
    }),
  });
  const memory = createAgentMemory({
    storage: input.storage,
    vector: input.vector,
    embedder: input.workspaceEmbedder,
    lastMessages: 20,
  });
  const memoryAgent = new Agent({
    id: ltmMastraId,
    name: `${input.agentName} Long-Term Memory`,
    instructions: createMemoryAgentInstructions({
      agentId: input.agentId,
      agentName: input.agentName,
      agentDescription: input.agentDescription,
      roleName: input.roleName,
      roleDescription: input.roleDescription,
      instructions: input.instructions,
    }),
    model: input.model,
    workspace,
    memory,
  });

  let initialized = false;
  let idle = false;
  let running = false;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let currentAbortController: AbortController | null = null;
  let runLastMessages = INITIAL_RUN_LAST_MESSAGES;
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

  async function backfillCheckpointPackages() {
    const store = input.storage.stores.memory;
    if (!store || !hasObservationalMemoryAccess(store)) {
      return;
    }

    const state = await readState();
    const thread = await store.getThreadById({ threadId: input.threadId });
    const customState = getCustomCheckpointedContextState(thread?.metadata);
    const checkpointGeneration = customState?.checkpointGeneration ?? null;
    const checkpointSummary = customState?.checkpointSummary ?? null;

    if (!checkpointSummary || checkpointGeneration === null) {
      return;
    }

    if (state.packages.some((entry) => entry.checkpointGeneration === checkpointGeneration)) {
      return;
    }

    const reflectionRecords = await store.getObservationalMemoryHistory(
      input.threadId,
      input.resourceId,
      500,
    );
    const payload = buildBootstrapCheckpointPackage({
      threadId: input.threadId,
      resourceId: input.resourceId,
      checkpointGeneration,
      checkpointSummary,
      reflectionRecords,
      observationBlocks: customState?.observationBlocks ?? [],
    });

    await writeCheckpointPackage(payload);
  }

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
      packageCount: state.packages.length,
    };
  }

  async function markRecallIndexDirty(reason: string) {
    await ensureInitialized();
    const stampPath = path.resolve(input.agentMemoryPath, LTM_RECALL_INDEX_STAMP_FILE);
    const payload = JSON.stringify({
      updatedAt: new Date().toISOString(),
      reason,
    });
    await fs.writeFile(stampPath, payload);
  }

  async function scheduleRun(delayMs: number) {
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
    await fs.mkdir(tempPackagePath, { recursive: true });
    await fs.writeFile(
      path.resolve(tempPackagePath, 'README.md'),
      renderCheckpointPackageReadme({
        agentId: input.agentId,
        threadId: payload.threadId,
        packageId,
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
      createdAt: payload.checkpointSummary.updatedAt,
      checkpointSummaryUpdatedAt: payload.checkpointSummary.updatedAt,
      reflectionCount: payload.reflections.length,
      observationCount: payload.observations.length,
    };

    state.packages.push(manifest);
    state.lastWrittenPackageId = packageId;
    state.lastWrittenAt = payload.checkpointSummary.updatedAt;
    state.lastRunError = null;
    state.lastRunErrorAt = null;
    await writeState(state);
    await markRecallIndexDirty('checkpoint-write');
    await refreshRecallIndex?.();

    forgeDebug('ltm', 'checkpoint package write complete', {
      agentId: input.agentId,
      threadId: payload.threadId,
      packageId,
      checkpointGeneration: payload.toGeneration,
    });

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
            memory: {
              thread: ltmMastraId,
              resource: ltmMastraId,
              options: {
                lastMessages: runLastMessages,
              },
            },
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
              forgeDebug('ltm', 'memory workflow step complete', {
                agentId: input.agentId,
                hasToolCalls: iteration.toolCalls.length > 0,
                outputLength: iteration.text.length,
                iteration: iteration.iteration,
              });

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
      } finally {
        currentAbortController = null;
      }
    }

    if (!result) {
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
    runLastMessages = INITIAL_RUN_LAST_MESSAGES;
    currentAbortController = new AbortController();
    const beforeSnapshot = await snapshotTrackedFiles(input.agentWorkspacePath);

    try {
      forgeDebug('ltm', 'memory workflow start', {
        agentId: input.agentId,
        packageIds: availablePackages.map((entry) => entry.packageId),
        packageCount: state.packages.length,
      });

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

      forgeDebug('ltm', 'memory workflow complete', {
        agentId: input.agentId,
        packageIds: state.packages.map((entry) => entry.packageId),
        changedFiles: Array.from(changedFiles).sort(),
      });

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
      forgeDebug('ltm', 'memory workflow failed', {
        agentId: input.agentId,
        error: state.lastRunError,
      });
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
      await backfillCheckpointPackages();
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
      await workspace.destroy();
    },
  };
}

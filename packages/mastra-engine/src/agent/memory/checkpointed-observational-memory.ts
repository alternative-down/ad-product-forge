import { randomUUID } from 'node:crypto';

import { Agent } from '@mastra/core/agent';
import type { MastraDBMessage, MessageList } from '@mastra/core/agent';
import { getThreadOMMetadata, setThreadOMMetadata } from '@mastra/core/memory';
import type {
  ProcessInputStepArgs,
  Processor,
} from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import type {
  CreateObservationalMemoryInput,
  ObservationalMemoryRecord,
} from '@mastra/core/storage';
import type { AgentConfig } from '@mastra/core/agent';
import type { LibSQLStore } from '@mastra/libsql';
import {
  TokenCounter,
  buildObserverPrompt,
  buildObserverSystemPrompt,
  parseObserverOutput,
} from '@mastra/memory/processors';

import { forgeDebug } from '../../debug';

type StorageThread = {
  id: string;
  title?: string;
  metadata?: Record<string, unknown>;
};

type MemoryStore = NonNullable<LibSQLStore['stores']['memory']>;

type ObservationBlock = {
  id: string;
  text: string;
  tokenCount: number;
  createdAt: string;
  lastObservedAt: string;
  reflectedGeneration: number | null;
};

type ReflectionBlock = {
  recordId: string;
  generationCount: number;
  tokenCount: number;
  createdAt: string;
};

type CheckpointSummary = {
  text: string;
  tokenCount: number;
  upToGeneration: number;
  updatedAt: string;
};

type CustomOmState = {
  version: 1;
  checkpointGeneration: number | null;
  checkpointSummary: CheckpointSummary | null;
  observationBlocks: ObservationBlock[];
  activeReflectionBlocks: ReflectionBlock[];
};

type CheckpointedObservationalMemoryConfig = {
  storage: LibSQLStore;
  model: AgentConfig['model'];
  totalContextTokens?: number;
  recentRawTokens?: number;
  rawObservationBatchTokens?: number;
  observationReflectionBatchTokens?: number;
  observationSupportTokens?: number;
  reflectionSupportTokens?: number;
};

const CUSTOM_OM_TAG_REFLECTIONS = 'custom-om-reflections';
const CUSTOM_OM_TAG_CHECKPOINT = 'custom-om-checkpoint';
const CUSTOM_OM_TAG_OBSERVATIONS = 'custom-om-observations';
const DEFAULT_TOTAL_CONTEXT_TOKENS = 50_000;
const DEFAULT_RECENT_RAW_TOKENS = 10_000;
const DEFAULT_RAW_OBSERVATION_BATCH_TOKENS = 5_000;
const DEFAULT_OBSERVATION_REFLECTION_BATCH_TOKENS = 5_000;
const DEFAULT_SUPPORT_TOKENS = 2_000;
const DEFAULT_GENERATION_TIMEOUT_MS = 120_000;
const REFLECTOR_SYSTEM_PROMPT = [
  'You compress batches of observations into a smaller durable reflection.',
  'Preserve concrete facts, decisions, active work, unresolved risks, and anything that would matter later.',
  'Do not drop operational detail that would still matter for continuity.',
  'Return XML with a single <observations>...</observations> block.',
].join('\n');

function buildReflectorSystemPrompt() {
  return REFLECTOR_SYSTEM_PROMPT;
}

function buildReflectorPrompt(observations: string) {
  return [
    'Compress the observations below into a tighter reflection.',
    'Preserve the important details while removing redundancy.',
    '',
    '<observations>',
    observations,
    '</observations>',
  ].join('\n');
}

function parseReflectorOutput(output: string) {
  const match = output.match(/<observations>([\s\S]*?)<\/observations>/i);
  return {
    observations: (match?.[1] ?? output).trim(),
  };
}

type MemoryStoreWithObservationalMemory = MemoryStore & {
  getObservationalMemory(threadId: string | null, resourceId: string): Promise<ObservationalMemoryRecord | null>;
  getObservationalMemoryHistory(
    threadId: string | null,
    resourceId: string,
    limit?: number,
  ): Promise<ObservationalMemoryRecord[]>;
  initializeObservationalMemory(input: CreateObservationalMemoryInput): Promise<ObservationalMemoryRecord>;
  updateActiveObservations(input: {
    id: string;
    observations: string;
    tokenCount: number;
    lastObservedAt: Date;
    observedMessageIds?: string[];
    observedTimezone?: string;
  }): Promise<void>;
  insertObservationalMemoryRecord(record: ObservationalMemoryRecord): Promise<void>;
  getThreadById(input: { threadId: string }): Promise<StorageThread | null>;
  updateThread(input: { id: string; title?: string; metadata?: Record<string, unknown> }): Promise<unknown>;
};

function hasObservationalMemoryStore(store: MemoryStore): store is MemoryStoreWithObservationalMemory {
  return (
    'getObservationalMemory' in store &&
    typeof store.getObservationalMemory === 'function' &&
    'getObservationalMemoryHistory' in store &&
    typeof store.getObservationalMemoryHistory === 'function' &&
    'initializeObservationalMemory' in store &&
    typeof store.initializeObservationalMemory === 'function' &&
    'insertObservationalMemoryRecord' in store &&
    typeof store.insertObservationalMemoryRecord === 'function'
  );
}

function getThreadContext(requestContext: RequestContext | undefined, messageList: MessageList) {
  const memoryContext = requestContext?.get('MastraMemory') as
    | { thread?: { id?: string }; resourceId?: string }
    | undefined;
  if (memoryContext?.thread?.id) {
    return {
      threadId: memoryContext.thread.id,
      resourceId: memoryContext.resourceId ?? memoryContext.thread.id,
    };
  }

  const serialized = messageList.serialize();
  if (serialized.memoryInfo?.threadId) {
    return {
      threadId: serialized.memoryInfo.threadId,
      resourceId: serialized.memoryInfo.resourceId ?? serialized.memoryInfo.threadId,
    };
  }

  return null;
}

function getCustomOmState(thread: StorageThread | null): CustomOmState {
  const raw = thread?.metadata?.mastra;
  const rawOm = raw && typeof raw === 'object' ? (raw as { om?: Record<string, unknown> }).om : undefined;
  const custom = rawOm?.customCheckpointedContext;

  if (
    typeof custom !== 'object' ||
    custom === null ||
    !('version' in custom) ||
    custom.version !== 1
  ) {
    return {
      version: 1,
      checkpointGeneration: null,
      checkpointSummary: null,
      observationBlocks: [],
      activeReflectionBlocks: [],
    };
  }

  const value = custom as Partial<CustomOmState>;
  return {
    version: 1,
    checkpointGeneration:
      typeof value.checkpointGeneration === 'number' ? value.checkpointGeneration : null,
    checkpointSummary:
      value.checkpointSummary && typeof value.checkpointSummary === 'object'
        ? value.checkpointSummary as CheckpointSummary
        : null,
    observationBlocks: Array.isArray(value.observationBlocks) ? value.observationBlocks : [],
    activeReflectionBlocks: Array.isArray(value.activeReflectionBlocks)
      ? value.activeReflectionBlocks
      : [],
  };
}

function setCustomOmState(
  thread: StorageThread,
  state: CustomOmState,
  omMetadata: ReturnType<typeof getThreadOMMetadata>,
) {
  const baseMetadata = setThreadOMMetadata(thread.metadata, omMetadata ?? {});
  const mastra = baseMetadata.mastra && typeof baseMetadata.mastra === 'object'
    ? (baseMetadata.mastra as Record<string, unknown>)
    : {};
  const om = mastra.om && typeof mastra.om === 'object'
    ? (mastra.om as Record<string, unknown>)
    : {};

  return {
    ...baseMetadata,
    mastra: {
      ...mastra,
      om: {
        ...om,
        customCheckpointedContext: state,
      },
    },
  };
}

function sumTokens(blocks: Array<{ tokenCount: number }>) {
  return blocks.reduce((total, block) => total + block.tokenCount, 0);
}

function getActiveObservationBlocks(state: CustomOmState) {
  return state.observationBlocks.filter((block) => block.reflectedGeneration === null);
}

function formatObservationBlocks(blocks: ObservationBlock[]) {
  return blocks.map((block) => block.text.trim()).filter(Boolean).join('\n');
}

function takeSupportText(
  blocks: ObservationBlock[],
  tokenCounter: TokenCounter,
  tokenLimit: number,
) {
  if (tokenLimit <= 0) {
    return '';
  }

  const selected: string[] = [];
  let usedTokens = 0;

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const text = blocks[index]?.text?.trim();
    if (!text) {
      continue;
    }

    const tokenCount = tokenCounter.countObservations(text);
    if (usedTokens + tokenCount > tokenLimit) {
      break;
    }

    selected.unshift(text);
    usedTokens += tokenCount;
  }

  return selected.join('\n');
}

function buildReflectionBudget(input: {
  totalContextTokens: number;
  recentRawTokens: number;
  rawObservationBatchTokens: number;
  observationReflectionBatchTokens: number;
}) {
  return Math.max(
    0,
    input.totalContextTokens
      - input.recentRawTokens
      - input.rawObservationBatchTokens
      - input.observationReflectionBatchTokens,
  );
}

function logOmState(
  event: string,
  input: {
    threadId: string;
    resourceId: string;
    state: CustomOmState;
    recentRawCount?: number;
    recentRawTokens?: number;
    overflowCount?: number;
    overflowTokens?: number;
    reflectionBudget?: number;
  },
) {
  forgeDebug('checkpointed-om', event, {
    threadId: input.threadId,
    resourceId: input.resourceId,
    checkpointGeneration: input.state.checkpointGeneration,
    checkpointSummaryTokens: input.state.checkpointSummary?.tokenCount ?? 0,
    activeObservationBlockCount: getActiveObservationBlocks(input.state).length,
    activeObservationTokens: sumTokens(getActiveObservationBlocks(input.state)),
    activeReflectionBlockCount: input.state.activeReflectionBlocks.length,
    activeReflectionTokens: sumTokens(input.state.activeReflectionBlocks),
    recentRawCount: input.recentRawCount,
    recentRawTokens: input.recentRawTokens,
    overflowCount: input.overflowCount,
    overflowTokens: input.overflowTokens,
    reflectionBudget: input.reflectionBudget,
  });
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void,
) {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`checkpointed OM generation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function renderReflectionSystemText(reflections: ObservationalMemoryRecord[]) {
  const content = reflections
    .map((record) => record.activeObservations.trim())
    .filter(Boolean)
    .join('\n\n');

  if (!content) {
    return '';
  }

  return ['Active reflections:', content].join('\n');
}

function renderCheckpointSystemText(summary: CheckpointSummary | null) {
  const content = summary?.text?.trim();
  if (!content) {
    return '';
  }

  return ['Checkpoint summary:', content].join('\n');
}

function renderObservationSystemText(blocks: ObservationBlock[]) {
  const content = formatObservationBlocks(blocks);
  if (!content) {
    return '';
  }

  return ['Active observations:', content].join('\n');
}

function getObservationCursor(record: ObservationalMemoryRecord) {
  if (!record.lastObservedAt) {
    return null;
  }

  return new Date(record.lastObservedAt);
}

function getMessagesAfterCursor(messages: MastraDBMessage[], cursor: Date | null) {
  if (!cursor) {
    return messages;
  }

  return messages.filter((message) => {
    if (!message.createdAt) {
      return true;
    }

    return new Date(message.createdAt) > cursor;
  });
}

function splitRawMessagesByRecentReserve(
  messages: MastraDBMessage[],
  tokenCounter: TokenCounter,
  recentRawTokens: number,
) {
  const recentIds = new Set<string>();
  let usedTokens = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const tokenCount = tokenCounter.countMessage(message);

    if (recentIds.size > 0 && usedTokens + tokenCount > recentRawTokens) {
      break;
    }

    recentIds.add(message.id);
    usedTokens += tokenCount;
  }

  const overflow: MastraDBMessage[] = [];
  const recent: MastraDBMessage[] = [];

  for (const message of messages) {
    if (recentIds.has(message.id)) {
      recent.push(message);
      continue;
    }

    overflow.push(message);
  }

  return { recent, overflow };
}

function takeMessageBatch(
  messages: MastraDBMessage[],
  tokenCounter: TokenCounter,
  threshold: number,
) {
  const selected: MastraDBMessage[] = [];
  let usedTokens = 0;

  for (const message of messages) {
    selected.push(message);
    usedTokens += tokenCounter.countMessage(message);

    if (usedTokens >= threshold) {
      break;
    }
  }

  return { selected, usedTokens };
}

function takeObservationBatch(blocks: ObservationBlock[], threshold: number) {
  const selected: ObservationBlock[] = [];
  let usedTokens = 0;

  for (const block of blocks) {
    if (block.reflectedGeneration !== null) {
      continue;
    }

    selected.push(block);
    usedTokens += block.tokenCount;

    if (usedTokens >= threshold) {
      break;
    }
  }

  return { selected, usedTokens };
}

export class CheckpointedObservationalMemoryProcessor
  implements Processor<'checkpointed-observational-memory'>
{
  readonly id = 'checkpointed-observational-memory' as const;
  readonly name = 'Checkpointed Observational Memory';

  private readonly store: MemoryStoreWithObservationalMemory;
  private readonly tokenCounter: TokenCounter;
  private readonly model: AgentConfig['model'];
  private readonly totalContextTokens: number;
  private readonly recentRawTokens: number;
  private readonly rawObservationBatchTokens: number;
  private readonly observationReflectionBatchTokens: number;
  private readonly observationSupportTokens: number;
  private readonly reflectionSupportTokens: number;

  constructor(config: CheckpointedObservationalMemoryConfig) {
    if (!hasObservationalMemoryStore(config.storage.stores.memory!)) {
      throw new Error('Checkpointed OM requires a memory store with observational memory support');
    }

    this.store = config.storage.stores.memory;
    this.model = config.model;
    this.tokenCounter = new TokenCounter();
    this.totalContextTokens = config.totalContextTokens ?? DEFAULT_TOTAL_CONTEXT_TOKENS;
    this.recentRawTokens = config.recentRawTokens ?? DEFAULT_RECENT_RAW_TOKENS;
    this.rawObservationBatchTokens =
      config.rawObservationBatchTokens ?? DEFAULT_RAW_OBSERVATION_BATCH_TOKENS;
    this.observationReflectionBatchTokens =
      config.observationReflectionBatchTokens ?? DEFAULT_OBSERVATION_REFLECTION_BATCH_TOKENS;
    this.observationSupportTokens = config.observationSupportTokens ?? DEFAULT_SUPPORT_TOKENS;
    this.reflectionSupportTokens = config.reflectionSupportTokens ?? DEFAULT_SUPPORT_TOKENS;
  }

  private async generateOmText(input: {
    agentId: string;
    agentName: string;
    instructions: string;
    prompt: string;
    requestContext?: RequestContext;
    debugContext: Record<string, unknown>;
  }) {
    const controller = new AbortController();

    try {
      const agent = new Agent({
        id: input.agentId,
        name: input.agentName,
        model: this.model,
        instructions: input.instructions,
      });
      const result = await withTimeout(
        agent.generate(input.prompt, {
          maxSteps: 1,
          abortSignal: controller.signal,
          requestContext: input.requestContext,
        }),
        DEFAULT_GENERATION_TIMEOUT_MS,
        () => controller.abort(),
      );

      return result.text;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const details = JSON.stringify(input.debugContext);
      throw new Error(`${input.agentName} failed: ${message}. Context: ${details}`);
    }
  }

  async processInputStep(args: ProcessInputStepArgs) {
    const context = getThreadContext(args.requestContext, args.messageList);
    if (!context) {
      return args.messageList;
    }

    const thread = await this.store.getThreadById({ threadId: context.threadId });
    const omMetadata = getThreadOMMetadata(thread?.metadata);
    const customState = getCustomOmState(thread);
    let currentRecord = await this.ensureCurrentRecord(context.threadId, context.resourceId);
    let activeReflections = await this.loadActiveReflections(
      context.threadId,
      context.resourceId,
      customState.activeReflectionBlocks,
    );

    while (true) {
      const rawMessages = getMessagesAfterCursor(
        args.messageList.get.all.db(),
        getObservationCursor(currentRecord),
      );
      const { recent, overflow } = splitRawMessagesByRecentReserve(
        rawMessages,
        this.tokenCounter,
        this.recentRawTokens,
      );
      const recentRawTokens = this.tokenCounter.countMessages(recent);
      const overflowTokens = this.tokenCounter.countMessages(overflow);
      const reflectionBudget = buildReflectionBudget({
        totalContextTokens: this.totalContextTokens,
        recentRawTokens: this.recentRawTokens,
        rawObservationBatchTokens: this.rawObservationBatchTokens,
        observationReflectionBatchTokens: this.observationReflectionBatchTokens,
      });

      logOmState('state loaded', {
        threadId: context.threadId,
        resourceId: context.resourceId,
        state: customState,
        recentRawCount: recent.length,
        recentRawTokens,
        overflowCount: overflow.length,
        overflowTokens,
        reflectionBudget,
      });

      if (sumTokens(getActiveObservationBlocks(customState)) >= this.observationReflectionBatchTokens) {
        forgeDebug('checkpointed-om', 'reflection threshold reached', {
          threadId: context.threadId,
          resourceId: context.resourceId,
          activeObservationTokens: sumTokens(getActiveObservationBlocks(customState)),
          threshold: this.observationReflectionBatchTokens,
        });
        currentRecord = await this.createReflectionGeneration({
          currentRecord,
          threadId: context.threadId,
          resourceId: context.resourceId,
          state: customState,
          requestContext: args.requestContext,
        });
        activeReflections = await this.loadActiveReflections(
          context.threadId,
          context.resourceId,
          customState.activeReflectionBlocks,
        );
        continue;
      }

      if (overflowTokens >= this.rawObservationBatchTokens) {
        forgeDebug('checkpointed-om', 'observation threshold reached', {
          threadId: context.threadId,
          resourceId: context.resourceId,
          overflowCount: overflow.length,
          overflowTokens,
          threshold: this.rawObservationBatchTokens,
        });
        currentRecord = await this.createObservationBlock({
          currentRecord,
          threadId: context.threadId,
          resourceId: context.resourceId,
          state: customState,
          overflow,
          omMetadata,
          requestContext: args.requestContext,
        });
        continue;
      }

      const reflectionTokens = activeReflections.reduce(
        (total, record) => total + this.tokenCounter.countObservations(record.activeObservations),
        0,
      );

      if (reflectionTokens > reflectionBudget && customState.activeReflectionBlocks.length > 0) {
        forgeDebug('checkpointed-om', 'reflection budget exceeded', {
          threadId: context.threadId,
          resourceId: context.resourceId,
          reflectionTokens,
          reflectionBudget,
        });
        await this.advanceCheckpoint({
          threadId: context.threadId,
          resourceId: context.resourceId,
          state: customState,
          activeReflections,
          reflectionBudget,
          requestContext: args.requestContext,
        });
        this.pruneArchivedObservationBlocks(customState);
        activeReflections = await this.loadActiveReflections(
          context.threadId,
          context.resourceId,
          customState.activeReflectionBlocks,
        );
        continue;
      }

      break;
    }

    if (thread) {
      await this.store.updateThread({
        id: thread.id,
        title: thread.title,
        metadata: setCustomOmState(thread, customState, omMetadata),
      });
    }

    logOmState('state persisted', {
      threadId: context.threadId,
      resourceId: context.resourceId,
      state: customState,
    });

    this.rebuildMessageList(args.messageList, {
      record: currentRecord,
      reflections: activeReflections,
      checkpointSummary: customState.checkpointSummary,
      observationBlocks: customState.observationBlocks.filter(
        (block) => block.reflectedGeneration === null,
      ),
    });

    forgeDebug('checkpointed-om', 'message list rebuilt', {
      threadId: context.threadId,
      resourceId: context.resourceId,
      rememberedCount: args.messageList.get.remembered.db().length,
      activeReflectionCount: activeReflections.length,
      activeObservationCount: getActiveObservationBlocks(customState).length,
    });

    return args.messageList;
  }

  private async ensureCurrentRecord(threadId: string, resourceId: string) {
    const currentRecord = await this.store.getObservationalMemory(threadId, resourceId);
    if (currentRecord) {
      return currentRecord;
    }

    return this.store.initializeObservationalMemory({
      threadId,
      resourceId,
      scope: 'thread',
      config: {
        kind: 'checkpointed-observational-memory',
      },
    });
  }

  private async createObservationBlock(input: {
    currentRecord: ObservationalMemoryRecord;
    threadId: string;
    resourceId: string;
    state: CustomOmState;
    overflow: MastraDBMessage[];
    omMetadata: ReturnType<typeof getThreadOMMetadata>;
    requestContext: RequestContext | undefined;
  }) {
    const batch = takeMessageBatch(
      input.overflow,
      this.tokenCounter,
      this.rawObservationBatchTokens,
    );
    forgeDebug('checkpointed-om', 'creating observation block', {
      threadId: input.threadId,
      resourceId: input.resourceId,
      batchMessageCount: batch.selected.length,
      batchTokenCount: batch.usedTokens,
    });
    const activeObservationBlocks = getActiveObservationBlocks(input.state);
    const supportText = takeSupportText(
      activeObservationBlocks,
      this.tokenCounter,
      this.observationSupportTokens,
    );
    const observerText = await this.generateOmText({
      agentId: `custom-observer-${randomUUID()}`,
      agentName: 'Checkpointed OM observer',
      instructions: buildObserverSystemPrompt(false),
      prompt: buildObserverPrompt(supportText || undefined, batch.selected),
      requestContext: input.requestContext,
      debugContext: {
        phase: 'observe',
        batchMessageCount: batch.selected.length,
        batchTokenCount: batch.usedTokens,
        supportTokenBudget: this.observationSupportTokens,
      },
    });
    const parsed = parseObserverOutput(observerText);
    const observationText = parsed.observations.trim();

    if (!observationText) {
      throw new Error('Custom OM observer returned no observations');
    }

    const lastObservedAt = batch.selected.at(-1)?.createdAt;
    if (!lastObservedAt) {
      throw new Error('Custom OM observation batch ended without createdAt');
    }

    input.state.observationBlocks.push({
      id: randomUUID(),
      text: observationText,
      tokenCount: this.tokenCounter.countObservations(observationText),
      createdAt: new Date().toISOString(),
      lastObservedAt: new Date(lastObservedAt).toISOString(),
      reflectedGeneration: null,
    });

    const activeObservationText = formatObservationBlocks(
      getActiveObservationBlocks(input.state),
    );

    await this.store.updateActiveObservations({
      id: input.currentRecord.id,
      observations: activeObservationText,
      tokenCount: this.tokenCounter.countObservations(activeObservationText),
      lastObservedAt: new Date(lastObservedAt),
      observedMessageIds: batch.selected.map((message) => message.id),
      observedTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    forgeDebug('checkpointed-om', 'observation block created', {
      threadId: input.threadId,
      resourceId: input.resourceId,
      activeObservationBlockCount: getActiveObservationBlocks(input.state).length,
      activeObservationTokens: this.tokenCounter.countObservations(activeObservationText),
      lastObservedAt,
    });

    return {
      ...input.currentRecord,
      activeObservations: activeObservationText,
      observationTokenCount: this.tokenCounter.countObservations(activeObservationText),
      lastObservedAt: new Date(lastObservedAt),
      updatedAt: new Date(),
    };
  }

  private async createReflectionGeneration(input: {
    currentRecord: ObservationalMemoryRecord;
    threadId: string;
    resourceId: string;
    state: CustomOmState;
    requestContext?: RequestContext;
  }) {
    const unreflectedBlocks = getActiveObservationBlocks(input.state);
    const batch = takeObservationBatch(unreflectedBlocks, this.observationReflectionBatchTokens);
    forgeDebug('checkpointed-om', 'creating reflection block', {
      threadId: input.threadId,
      resourceId: input.resourceId,
      observationBlockCount: batch.selected.length,
      observationBatchTokens: batch.usedTokens,
    });
    const selectedText = batch.selected.map((block) => block.text).join('\n');
    const supportText = takeSupportText(unreflectedBlocks.slice(0, -batch.selected.length), this.tokenCounter, this.reflectionSupportTokens);
    const reflectorText = await this.generateOmText({
      agentId: `custom-reflector-${randomUUID()}`,
      agentName: 'Checkpointed OM reflector',
      instructions: buildReflectorSystemPrompt(),
      prompt: buildReflectorPrompt([supportText, selectedText].filter(Boolean).join('\n')),
      requestContext: input.requestContext,
      debugContext: {
        phase: 'reflect',
        observationBlockCount: batch.selected.length,
        observationBatchTokens: batch.usedTokens,
        supportTokenBudget: this.reflectionSupportTokens,
      },
    });
    const parsed = parseReflectorOutput(reflectorText);
    const reflectionText = parsed.observations.trim();

    if (!reflectionText) {
      throw new Error('Custom OM reflector returned no observations');
    }

    const reflectionGeneration = input.currentRecord.generationCount + 1;
    const currentGeneration = reflectionGeneration + 1;
    const now = new Date();
    const reflectionRecord: ObservationalMemoryRecord = {
      ...input.currentRecord,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      originType: 'reflection',
      generationCount: reflectionGeneration,
      activeObservations: reflectionText,
      observationTokenCount: this.tokenCounter.countObservations(reflectionText),
      totalTokensObserved: input.currentRecord.totalTokensObserved,
      pendingMessageTokens: 0,
      isObserving: false,
      isReflecting: false,
      isBufferingObservation: false,
      isBufferingReflection: false,
      lastBufferedAtTokens: 0,
      lastBufferedAtTime: null,
      bufferedObservationChunks: [],
      observedMessageIds: [],
    };

    await this.store.insertObservationalMemoryRecord(reflectionRecord);

    input.state.activeReflectionBlocks.push({
      recordId: reflectionRecord.id,
      generationCount: reflectionRecord.generationCount,
      tokenCount: reflectionRecord.observationTokenCount,
      createdAt: reflectionRecord.createdAt.toISOString(),
    });

    for (const block of batch.selected) {
      block.reflectedGeneration = reflectionRecord.generationCount;
    }

    const remainingObservationText = formatObservationBlocks(
      getActiveObservationBlocks(input.state),
    );
    const currentRecord: ObservationalMemoryRecord = {
      ...input.currentRecord,
      id: randomUUID(),
      createdAt: new Date(now.getTime() + 1),
      updatedAt: new Date(now.getTime() + 1),
      originType: 'initial',
      generationCount: currentGeneration,
      activeObservations: remainingObservationText,
      observationTokenCount: this.tokenCounter.countObservations(remainingObservationText),
      pendingMessageTokens: 0,
      isObserving: false,
      isReflecting: false,
      isBufferingObservation: false,
      isBufferingReflection: false,
      lastBufferedAtTokens: 0,
      lastBufferedAtTime: null,
      bufferedObservationChunks: [],
      observedMessageIds: [],
    };

    await this.store.insertObservationalMemoryRecord(currentRecord);
    forgeDebug('checkpointed-om', 'reflection block created', {
      threadId: input.threadId,
      resourceId: input.resourceId,
      reflectionGeneration,
      currentGeneration,
      reflectionTokens: reflectionRecord.observationTokenCount,
      remainingObservationBlockCount: getActiveObservationBlocks(input.state).length,
    });
    return currentRecord;
  }

  private async loadActiveReflections(
    threadId: string,
    resourceId: string,
    activeBlocks: ReflectionBlock[],
  ) {
    if (activeBlocks.length === 0) {
      return [];
    }

    const history = await this.store.getObservationalMemoryHistory(threadId, resourceId, 200);
    const recordMap = new Map(history.map((record) => [record.id, record]));

    return activeBlocks
      .map((block) => recordMap.get(block.recordId))
      .filter((record): record is ObservationalMemoryRecord => Boolean(record))
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  private async advanceCheckpoint(input: {
    threadId: string;
    resourceId: string;
    state: CustomOmState;
    activeReflections: ObservationalMemoryRecord[];
    reflectionBudget: number;
    requestContext?: RequestContext;
  }) {
    let currentTokens = sumTokens(input.state.activeReflectionBlocks);
    const removedBlocks: ReflectionBlock[] = [];

    while (currentTokens > input.reflectionBudget && input.state.activeReflectionBlocks.length > 0) {
      const removed = input.state.activeReflectionBlocks.shift();
      if (!removed) {
        break;
      }

      removedBlocks.push(removed);
      input.state.checkpointGeneration = removed.generationCount;
      currentTokens -= removed.tokenCount;
      forgeDebug('checkpointed-om', 'checkpoint advanced', {
        threadId: input.threadId,
        resourceId: input.resourceId,
        checkpointGeneration: input.state.checkpointGeneration,
        removedReflectionRecordId: removed.recordId,
        removedReflectionTokens: removed.tokenCount,
        remainingReflectionTokens: currentTokens,
        reflectionBudget: input.reflectionBudget,
      });
    }

    if (removedBlocks.length === 0 || input.state.checkpointGeneration === null) {
      return;
    }

    const removedRecordIds = new Set(removedBlocks.map((block) => block.recordId));
    const removedReflectionText = input.activeReflections
      .filter((record) => removedRecordIds.has(record.id))
      .map((record) => record.activeObservations.trim())
      .filter(Boolean)
      .join('\n\n');

    if (!removedReflectionText) {
      return;
    }

    forgeDebug('checkpointed-om', 'creating checkpoint summary', {
      threadId: input.threadId,
      resourceId: input.resourceId,
      removedReflectionCount: removedBlocks.length,
      removedReflectionTokens: removedBlocks.reduce((total, block) => total + block.tokenCount, 0),
      previousCheckpointSummaryTokens: input.state.checkpointSummary?.tokenCount ?? 0,
    });

    const checkpointText = await this.generateOmText({
      agentId: `custom-checkpoint-${randomUUID()}`,
      agentName: 'Checkpointed OM checkpoint summarizer',
      instructions: buildReflectorSystemPrompt(),
      prompt: buildReflectorPrompt(
        [input.state.checkpointSummary?.text, removedReflectionText].filter(Boolean).join('\n\n'),
      ),
      requestContext: input.requestContext,
      debugContext: {
        phase: 'checkpoint',
        removedReflectionCount: removedBlocks.length,
        removedReflectionTokens: removedBlocks.reduce((total, block) => total + block.tokenCount, 0),
        previousCheckpointSummaryTokens: input.state.checkpointSummary?.tokenCount ?? 0,
      },
    });
    const parsed = parseReflectorOutput(checkpointText);
    const summaryText = parsed.observations.trim();

    if (!summaryText) {
      throw new Error('Checkpointed OM checkpoint summarizer returned no observations');
    }

    input.state.checkpointSummary = {
      text: summaryText,
      tokenCount: this.tokenCounter.countObservations(summaryText),
      upToGeneration: input.state.checkpointGeneration,
      updatedAt: new Date().toISOString(),
    };

    forgeDebug('checkpointed-om', 'checkpoint summary created', {
      threadId: input.threadId,
      resourceId: input.resourceId,
      checkpointGeneration: input.state.checkpointGeneration,
      checkpointSummaryTokens: input.state.checkpointSummary.tokenCount,
    });
  }

  private pruneArchivedObservationBlocks(state: CustomOmState) {
    if (state.checkpointGeneration === null) {
      return;
    }

    const checkpointGeneration = state.checkpointGeneration;

    state.observationBlocks = state.observationBlocks.filter((block) => {
      if (block.reflectedGeneration === null) {
        return true;
      }

      return block.reflectedGeneration > checkpointGeneration;
    });

    forgeDebug('checkpointed-om', 'archived observation blocks pruned', {
      checkpointGeneration,
      remainingObservationBlockCount: state.observationBlocks.length,
    });
  }

  private rebuildMessageList(
    messageList: MessageList,
    input: {
      record: ObservationalMemoryRecord;
      reflections: ObservationalMemoryRecord[];
      checkpointSummary: CheckpointSummary | null;
      observationBlocks: ObservationBlock[];
    },
  ) {
    const cursor = getObservationCursor(input.record);
    if (cursor) {
      const idsToRemove = messageList
        .get
        .remembered
        .db()
        .filter((message) => message.createdAt && new Date(message.createdAt) <= cursor)
        .map((message) => message.id);

      if (idsToRemove.length > 0) {
        messageList.removeByIds(idsToRemove);
      }
    }

    messageList.clearSystemMessages(CUSTOM_OM_TAG_CHECKPOINT);
    messageList.clearSystemMessages(CUSTOM_OM_TAG_REFLECTIONS);
    messageList.clearSystemMessages(CUSTOM_OM_TAG_OBSERVATIONS);

    const checkpointText = renderCheckpointSystemText(input.checkpointSummary);
    if (checkpointText) {
      messageList.addSystem(checkpointText, CUSTOM_OM_TAG_CHECKPOINT);
    }

    const reflectionsText = renderReflectionSystemText(input.reflections);
    if (reflectionsText) {
      messageList.addSystem(reflectionsText, CUSTOM_OM_TAG_REFLECTIONS);
    }

    const observationsText = renderObservationSystemText(input.observationBlocks);
    if (observationsText) {
      messageList.addSystem(observationsText, CUSTOM_OM_TAG_OBSERVATIONS);
    }
  }
}

export function createCheckpointedObservationalMemoryProcessor(
  config: CheckpointedObservationalMemoryConfig,
) {
  return new CheckpointedObservationalMemoryProcessor(config);
}

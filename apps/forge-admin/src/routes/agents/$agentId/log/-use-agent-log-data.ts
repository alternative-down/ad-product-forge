import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { clearAgentHistory, getAgentRuntimeMemory, getAgentThreadMessages } from '@/lib/admin-api';

const PAGE_SIZE = 20;
const LIVE_REFETCH_INTERVAL_MS = 5_000;

export interface AgentLogThreadMessage {
  id: string;
  createdAt: number;
  role: string;
  parts: Array<{ type: string; text?: string }>;
  metadata?: {
    toolInvocations?: Array<{ toolName: string; args?: unknown; result?: unknown }>;
    toolResults?: Array<{ toolName: string; result?: unknown }>;
  };
  operationalMemoryType?: string;
}

interface ThreadMessagesPage {
  items: AgentLogThreadMessage[];
  hasMore: boolean;
}

interface UseAgentLogDataOptions {
  agentId: string;
}

export interface AgentLogRuntimeMemoryData {
  workingMemory: string | null;
  agentContext: string | null;
  executionState: 'idle' | 'running' | 'absent';
  lastExecutionError: string | null;
  lastExecutionErrorAt: number | null;
  observations: string | null;
  reflection: string | null;
  generationCount: number | null;
  checkpointMessageId: string | null;
  checkpointGeneration: number | null;
  checkpointSummary: string | null;
  checkpointUpdatedAt: number | null;
  metrics: {
    rawMessageCount: number;
    recentRawMessageCount: number;
    recentRawTokenCount: number;
    recentRawTokenLimit: number;
    overflowMessageCount: number;
    overflowTokenCount: number;
    observationTriggerTokenLimit: number;
    activeObservationBlockCount: number;
    observationTokenCount: number;
    reflectionTriggerTokenLimit: number;
    activeReflectionBlockCount: number;
    reflectionTokenCount: number;
    reflectionBudget: number;
    checkpointTokenCount: number;
    checkpointSummaryUpToGeneration: number | null;
    latestThreadMessageAt: number | null;
  } | null;
}

export function useAgentLogData({ agentId }: UseAgentLogDataOptions) {
  const queryClient = useQueryClient();

  const runtimeMemoryQuery = useQuery({
    queryKey: ['admin', 'agent', agentId, 'runtime-memory'],
    queryFn: () => getAgentRuntimeMemory(agentId),
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
  });

  const messagesQuery = useInfiniteQuery({
    queryKey: ['admin', 'agent', agentId, 'thread-messages'],
    queryFn: ({ pageParam }: { pageParam: number }) =>
      getAgentThreadMessages(agentId, pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage: ThreadMessagesPage, _pages: ThreadMessagesPage[], lastPageParam: number) =>
      lastPage.hasMore ? lastPageParam + 1 : undefined,
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
  });

  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      if (!window.confirm('Limpar o histórico do agente e da LTM? Isso também limpa o estado observado atual.')) {
        return null;
      }

      return clearAgentHistory({
        agentId,
        includeLongTermMemoryThread: true,
      });
    },
    onSuccess: async (result: unknown) => {
      if (!result) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId, 'thread-messages'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId, 'ltm-thread-messages'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'agent', agentId, 'runtime-memory'] }),
      ]);
    },
  });

  return {
    runtimeMemoryQuery,
    messagesQuery,
    clearHistoryMutation,
  };
}

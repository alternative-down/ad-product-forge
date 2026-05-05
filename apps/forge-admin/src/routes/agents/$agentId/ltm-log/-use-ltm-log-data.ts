import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';

import {
  getAgentLongTermMemoryThreadMessages,
  getAgentRuntimeMemory,
  runAgentLongTermMemoryRecallSearch,
} from '@/lib/admin-api';
import type { AgentLongTermMemoryRecallDebugSearchResult } from '@/lib/admin-api/agent-types';

const PAGE_SIZE = 20;
const LIVE_REFETCH_INTERVAL_MS = 5_000;

export interface LtmThreadMessage {
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
  items: LtmThreadMessage[];
  hasMore: boolean;
}

interface UseLtmLogDataOptions {
  agentId: string;
  searchQuery: string;
}

export function useLtmLogData({ agentId, searchQuery }: UseLtmLogDataOptions) {
  const runtimeMemoryQuery = useQuery({
    queryKey: ['admin', 'agent', agentId, 'runtime-memory'],
    queryFn: () => getAgentRuntimeMemory(agentId),
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
  });

  const recallSearchMutation = useMutation({
    mutationFn: () =>
      runAgentLongTermMemoryRecallSearch({
        agentId,
        query: searchQuery,
      }),
  });

  const messagesQuery = useInfiniteQuery({
    queryKey: ['admin', 'agent', agentId, 'ltm-thread-messages'],
    queryFn: ({ pageParam }: { pageParam: number }) =>
      getAgentLongTermMemoryThreadMessages(agentId, pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage: ThreadMessagesPage, _pages: ThreadMessagesPage[], lastPageParam: number) =>
      lastPage.hasMore ? lastPageParam + 1 : undefined,
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
  });

  return {
    runtimeMemoryQuery,
    recallSearchMutation,
    messagesQuery,
  };
}
